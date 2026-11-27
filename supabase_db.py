"""Autentikasi Supabase Auth & lapisan persistensi sesi per user_id (RLS-aware + fallback lokal)."""
from __future__ import annotations

import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
import secrets
import uuid
from datetime import datetime, timezone

import requests
from requests.adapters import HTTPAdapter

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://rkcvkddbccpmhodryspm.supabase.co").rstrip("/")
SUPABASE_OFFLINE = os.getenv("SUPABASE_OFFLINE", "0") == "1"
SUPABASE_KEY = os.getenv(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrY3ZrZGRiY2NwbWhvZHJ5c3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MTkyMjQsImV4cCI6MjEwNzE5NTIyNH0.vg1ZOQ9SBEBsRiKkDGsgZH-mocGVFcdyFuoFHaT0Ots",
)

# Reuse persistent TLS keep-alive connection pool to Supabase for <50ms queries
HTTP = requests.Session()
_adapter = HTTPAdapter(pool_connections=16, pool_maxsize=32, max_retries=1)
HTTP.mount("https://", _adapter)
HTTP.mount("http://", _adapter)
_POOL = ThreadPoolExecutor(max_workers=8)
_TOKEN_CACHE: dict[str, dict] = {}


def _decode_supabase_jwt(token: str) -> dict | None:
    """Ekstrak user_id & profil langsung dari payload JWT Supabase tanpa round-trip jaringan.
    Jika token sudah kedaluwarsa (exp < sekarang), kembalikan None agar klien melakukan refresh token.
    """
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload_b64 = parts[1]
        pad = "=" * ((4 - len(payload_b64) % 4) % 4)
        raw = base64.urlsafe_b64decode(payload_b64 + pad)
        data = json.loads(raw.decode("utf-8"))
        exp = data.get("exp")
        if exp is not None:
            now_ts = datetime.now(timezone.utc).timestamp()
            if float(exp) <= (now_ts + 15):
                return None
        uid = data.get("sub")
        if not uid:
            return None
        meta = data.get("user_metadata") or {}
        email = data.get("email") or ""
        name = meta.get("name") or meta.get("full_name") or (email.split("@")[0] if email else "Pengguna")
        return {
            "id": uid,
            "email": email,
            "name": name,
            "exp": float(exp) if exp is not None else None,
        }
    except Exception:  # noqa: BLE001
        return None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_FALLBACK_PATH = os.path.join(BASE_DIR, "railuma_local_fallback.json")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _headers(access_token: str | None = None) -> dict:
    bearer = access_token if access_token else SUPABASE_KEY
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {bearer}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _baca_lokal() -> dict:
    if os.path.exists(LOCAL_FALLBACK_PATH):
        try:
            with open(LOCAL_FALLBACK_PATH, encoding="utf-8") as f:
                data = json.load(f)
                data.setdefault("users", [])
                data.setdefault("tokens", {})
                data.setdefault("sessions", [])
                data.setdefault("items", [])
                data.setdefault("revisions", [])
                data.setdefault("corrections", [])
                return data
        except Exception:  # noqa: BLE001
            pass
    return {"users": [], "tokens": {}, "sessions": [], "items": [], "revisions": [], "corrections": []}


def _simpan_lokal(data: dict) -> None:
    try:
        with open(LOCAL_FALLBACK_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:  # noqa: BLE001
        pass


def _hash_pw(pw: str) -> str:
    return hashlib.sha256(f"railuma:{pw}".encode("utf-8")).hexdigest()


def _terjemahkan_galat_auth(msg: str) -> str:
    """Terjemahkan pesan galat bahasa Inggris dari Supabase Auth (GoTrue) ke bahasa Indonesia."""
    if not msg:
        return "Gagal memproses autentikasi akun. Periksa kembali data Anda."
    low = msg.strip().lower()
    if "invalid login credentials" in low or "invalid_grant" in low:
        return "Email atau kata sandi salah. Periksa lagi lalu coba masuk kembali."
    if "email not confirmed" in low:
        return "Alamat email belum dikonfirmasi. Periksa kotak masuk email Anda."
    if "user already registered" in low or "already registered" in low or "already exists" in low:
        return "Alamat email ini sudah terdaftar. Silakan masuk menggunakan kata sandi Anda."
    if "password should be at least" in low:
        return "Kata sandi minimal harus 6 karakter."
    if "rate limit" in low or "too many requests" in low:
        return "Terlalu banyak percobaan masuk dalam waktu singkat. Tunggu sebentar lalu coba lagi."
    if "unable to validate email" in low or "invalid email" in low:
        return "Format alamat email tidak valid. Periksa kembali penulisan email Anda."
    return msg


class RailumaStore:
    """Mengelola Supabase Auth (GoTrue) dan CRUD RLS per user_id ke public.railuma_*."""

    def register_user(self, email: str, password: str, name: str = "") -> dict:
        clean_email = email.strip().lower()
        clean_name = name.strip() or clean_email.split("@")[0]

        if not SUPABASE_OFFLINE:
            try:
                r = HTTP.post(
                    f"{SUPABASE_URL}/auth/v1/signup",
                    headers=_headers(),
                    json={
                        "email": clean_email,
                        "password": password,
                        "data": {"name": clean_name},
                    },
                    timeout=5.0,
                )
                if r.status_code >= 400:
                    raw_msg = r.json().get("msg") or r.json().get("error_description") or r.json().get("message") or "Pendaftaran gagal."
                    raise ValueError(_terjemahkan_galat_auth(raw_msg))
                body = r.json()
                access_token = body.get("access_token")
                refresh_token = body.get("refresh_token") or ""
                user_obj = body.get("user") or body
                if not access_token:
                    return self.login_user(clean_email, password)
                user_dict = {
                    "id": user_obj.get("id"),
                    "email": user_obj.get("email", clean_email),
                    "name": (user_obj.get("user_metadata") or {}).get("name") or clean_name,
                }
                _TOKEN_CACHE[access_token] = user_dict
                return {
                    "access_token": access_token,
                    "refresh_token": refresh_token,
                    "user": user_dict,
                }
            except ValueError:
                raise
            except Exception:  # noqa: BLE001
                pass

        db = _baca_lokal()
        for u in db["users"]:
            if u["email"] == clean_email:
                raise ValueError("Email sudah terdaftar.")
        user_id = str(uuid.uuid4())
        user = {
            "id": user_id,
            "email": clean_email,
            "name": clean_name,
            "password_hash": _hash_pw(password),
            "created_at": _now_iso(),
        }
        token = f"local_{secrets.token_urlsafe(24)}"
        db["users"].append(user)
        db["tokens"][token] = {"id": user_id, "email": clean_email, "name": clean_name}
        _simpan_lokal(db)
        return {
            "access_token": token,
            "refresh_token": token,
            "user": {"id": user_id, "email": clean_email, "name": clean_name},
        }

    def login_user(self, email: str, password: str) -> dict:
        clean_email = email.strip().lower()
        if not SUPABASE_OFFLINE:
            try:
                r = HTTP.post(
                    f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                    headers=_headers(),
                    json={"email": clean_email, "password": password},
                    timeout=5.0,
                )
                if r.status_code >= 400:
                    raw_msg = r.json().get("error_description") or r.json().get("msg") or r.json().get("message") or "Email atau kata sandi salah."
                    raise ValueError(_terjemahkan_galat_auth(raw_msg))
                body = r.json()
                user_obj = body.get("user") or {}
                user_dict = {
                    "id": user_obj.get("id"),
                    "email": user_obj.get("email", clean_email),
                    "name": (user_obj.get("user_metadata") or {}).get("name") or clean_email.split("@")[0],
                }
                access_token = body["access_token"]
                _TOKEN_CACHE[access_token] = user_dict
                return {
                    "access_token": access_token,
                    "refresh_token": body.get("refresh_token") or "",
                    "user": user_dict,
                }
            except ValueError:
                raise
            except Exception:  # noqa: BLE001
                pass

        db = _baca_lokal()
        pw_hash = _hash_pw(password)
        for u in db["users"]:
            if u["email"] == clean_email and u.get("password_hash") == pw_hash:
                token = f"local_{secrets.token_urlsafe(24)}"
                info = {"id": u["id"], "email": u["email"], "name": u.get("name") or clean_email.split("@")[0]}
                db["tokens"][token] = info
                _simpan_lokal(db)
                return {"access_token": token, "refresh_token": token, "user": info}
        raise ValueError("Email atau kata sandi tidak cocok.")

    def refresh_user_token(self, refresh_token: str) -> dict | None:
        if not refresh_token:
            return None
        if refresh_token.startswith("local_"):
            db = _baca_lokal()
            info = db.get("tokens", {}).get(refresh_token)
            if info:
                return {"access_token": refresh_token, "refresh_token": refresh_token, "user": info}
            return None
        if not SUPABASE_OFFLINE:
            try:
                r = HTTP.post(
                    f"{SUPABASE_URL}/auth/v1/token?grant_type=refresh_token",
                    headers=_headers(),
                    json={"refresh_token": refresh_token},
                    timeout=5.0,
                )
                if r.ok:
                    body = r.json()
                    user_obj = body.get("user") or {}
                    email = user_obj.get("email", "")
                    user_dict = {
                        "id": user_obj.get("id"),
                        "email": email,
                        "name": (user_obj.get("user_metadata") or {}).get("name") or (email.split("@")[0] if email else "Pengguna"),
                    }
                    new_access = body.get("access_token")
                    if new_access:
                        _TOKEN_CACHE[new_access] = user_dict
                        return {
                            "access_token": new_access,
                            "refresh_token": body.get("refresh_token") or refresh_token,
                            "user": user_dict,
                        }
            except Exception:  # noqa: BLE001
                pass
        return None

    def get_user_from_token(self, access_token: str | None) -> dict | None:
        if not access_token:
            return None
        if access_token in _TOKEN_CACHE:
            cached = _TOKEN_CACHE[access_token]
            exp = cached.get("exp")
            if exp is not None and float(exp) <= (datetime.now(timezone.utc).timestamp() + 15):
                _TOKEN_CACHE.pop(access_token, None)
            else:
                return cached

        if not access_token.startswith("local_"):
            jwt_user = _decode_supabase_jwt(access_token)
            if jwt_user and jwt_user.get("id"):
                _TOKEN_CACHE[access_token] = jwt_user
                return jwt_user
            return None

        db = _baca_lokal()
        return db.get("tokens", {}).get(access_token)

    def external_providers(self) -> dict:
        """Daftar penyedia OAuth yang aktif di proyek Supabase (mis. google)."""
        if SUPABASE_OFFLINE:
            return {}
        try:
            r = HTTP.get(
                f"{SUPABASE_URL}/auth/v1/settings",
                headers={"apikey": SUPABASE_KEY},
                timeout=4.0,
            )
            if r.ok:
                return r.json().get("external") or {}
        except Exception:  # noqa: BLE001
            pass
        return {}

    def logout_user(self, access_token: str | None) -> None:
        if not access_token:
            return
        _TOKEN_CACHE.pop(access_token, None)
        if not SUPABASE_OFFLINE and not access_token.startswith("local_"):
            try:
                HTTP.post(
                    f"{SUPABASE_URL}/auth/v1/logout",
                    headers=_headers(access_token),
                    timeout=1.5,
                )
            except Exception:  # noqa: BLE001
                pass
        db = _baca_lokal()
        if access_token in db.get("tokens", {}):
            db["tokens"].pop(access_token, None)
            _simpan_lokal(db)

    def list_sessions(self, user_id: str, access_token: str | None = None) -> list[dict]:
        db_local = _baca_lokal()
        local_sessions = [s for s in db_local["sessions"] if s.get("user_id") == user_id]
        local_items_by_ses: dict[str, list] = {}
        for it in db_local["items"]:
            local_items_by_ses.setdefault(it["session_id"], []).append(it)

        if not SUPABASE_OFFLINE and access_token and not access_token.startswith("local_"):
            try:
                r = HTTP.get(
                    f"{SUPABASE_URL}/rest/v1/railuma_sessions?user_id=eq.{user_id}&select=*&order=pinned.desc,updated_at.desc",
                    headers=_headers(access_token),
                    timeout=8.0,
                )
                if r.ok:
                    sessions = r.json()
                    supa_ids = {s["id"] for s in sessions if "id" in s}
                    for ls in local_sessions:
                        if ls["id"] not in supa_ids:
                            sessions.append(ls)
                    session_ids = [s["id"] for s in sessions if "id" in s]
                    items = []
                    if session_ids:
                        ids_str = ",".join(session_ids)
                        r_items = HTTP.get(
                            f"{SUPABASE_URL}/rest/v1/railuma_scan_items?session_id=in.({ids_str})&select=id,session_id,final_text,status,confidence,created_at&order=created_at.desc&limit=300",
                            headers=_headers(access_token),
                            timeout=8.0,
                        )
                        items = r_items.json() if (r_items.ok and isinstance(r_items.json(), list)) else []
                    by_ses: dict[str, list] = {}
                    seen_item_ids: set[str] = set()
                    for it in items:
                        seen_item_ids.add(it["id"])
                        by_ses.setdefault(it["session_id"], []).append(it)
                    for sid, l_items in local_items_by_ses.items():
                        for lit in reversed(l_items):
                            if lit["id"] not in seen_item_ids:
                                by_ses.setdefault(sid, []).insert(0, lit)
                    for s in sessions:
                        daftar = by_ses.get(s["id"], [])
                        s["scan_count"] = len(daftar)
                        s["last_preview"] = daftar[0]["final_text"] if daftar else ""
                        s["needs_review_count"] = sum(1 for x in daftar if x.get("status") == "needs_review")
                    sessions.sort(
                        key=lambda x: (bool(x.get("pinned")), x.get("updated_at", "")),
                        reverse=True,
                    )
                    return sessions
            except Exception:  # noqa: BLE001
                pass

        sessions = local_sessions
        sessions.sort(
            key=lambda x: (bool(x.get("pinned")), x.get("updated_at", "")),
            reverse=True,
        )
        for s in sessions:
            daftar = local_items_by_ses.get(s["id"], [])
            s["scan_count"] = len(daftar)
            s["last_preview"] = daftar[-1]["final_text"] if daftar else ""
            s["needs_review_count"] = sum(1 for x in daftar if x.get("status") == "needs_review")
        return sessions

    def create_session(self, user_id: str, title: str = "Sesi Pindai Baru", access_token: str | None = None) -> dict:
        judul = (title or "Sesi Pindai Baru").strip()[:120]
        payload = {"user_id": user_id, "title": judul, "pinned": False}
        if not SUPABASE_OFFLINE and access_token and not access_token.startswith("local_"):
            try:
                r = HTTP.post(
                    f"{SUPABASE_URL}/rest/v1/railuma_sessions",
                    headers=_headers(access_token),
                    json=payload,
                    timeout=8.0,
                )
                if r.ok and r.json():
                    ses = r.json()[0]
                    ses["scan_count"] = 0
                    ses["last_preview"] = ""
                    ses["needs_review_count"] = 0
                    return ses
            except Exception:  # noqa: BLE001
                pass

        db = _baca_lokal()
        now = _now_iso()
        ses = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "title": judul,
            "pinned": False,
            "created_at": now,
            "updated_at": now,
            "scan_count": 0,
            "last_preview": "",
            "needs_review_count": 0,
        }
        db["sessions"].append(ses)
        _simpan_lokal(db)
        return ses

    def get_session_detail(self, user_id: str, session_id: str, access_token: str | None = None) -> dict | None:
        db_local = _baca_lokal()
        local_items = [i for i in db_local["items"] if i["session_id"] == session_id]
        for lit in local_items:
            lit["revisions"] = [rv for rv in db_local["revisions"] if rv["item_id"] == lit["id"]]

        if not SUPABASE_OFFLINE and access_token and not access_token.startswith("local_"):
            try:
                hdrs = _headers(access_token)
                f_ses = _POOL.submit(
                    HTTP.get,
                    f"{SUPABASE_URL}/rest/v1/railuma_sessions?id=eq.{session_id}&user_id=eq.{user_id}&select=*",
                    headers=hdrs,
                    timeout=8.0,
                )
                f_it = _POOL.submit(
                    HTTP.get,
                    f"{SUPABASE_URL}/rest/v1/railuma_scan_items?session_id=eq.{session_id}&select=*&order=created_at.asc",
                    headers=hdrs,
                    timeout=8.0,
                )
                r = f_ses.result()
                r_it = f_it.result()
                if r.ok and r.json():
                    ses = r.json()[0]
                    items = r_it.json() if r_it.ok else []
                    if items:
                        ids_str = ",".join(i["id"] for i in items)
                        r_rev = HTTP.get(
                            f"{SUPABASE_URL}/rest/v1/railuma_revisions?item_id=in.({ids_str})&select=*&order=revision_number.asc",
                            headers=hdrs,
                            timeout=6.0,
                        )
                        revs = r_rev.json() if r_rev.ok else []
                        by_item: dict[str, list] = {}
                        for rv in revs:
                            by_item.setdefault(rv["item_id"], []).append(rv)
                        for it in items:
                            it["revisions"] = by_item.get(it["id"], [])
                    seen_ids = {i["id"] for i in items}
                    for lit in local_items:
                        if lit["id"] not in seen_ids:
                            items.append(lit)
                    ses["items"] = items
                    return ses
            except Exception:  # noqa: BLE001
                pass

        for ses in db_local["sessions"]:
            if ses["id"] == session_id and ses.get("user_id") == user_id:
                return {**ses, "items": local_items}
        return None

    def update_session(
        self,
        user_id: str,
        session_id: str,
        title: str | None = None,
        pinned: bool | None = None,
        access_token: str | None = None,
    ) -> dict | None:
        patch: dict = {"updated_at": _now_iso()}
        if title is not None:
            patch["title"] = title.strip()[:120] or "Sesi Tanpa Judul"
        if pinned is not None:
            patch["pinned"] = bool(pinned)

        if not SUPABASE_OFFLINE and access_token and not access_token.startswith("local_"):
            try:
                r = HTTP.patch(
                    f"{SUPABASE_URL}/rest/v1/railuma_sessions?id=eq.{session_id}&user_id=eq.{user_id}",
                    headers=_headers(access_token),
                    json=patch,
                    timeout=3.5,
                )
                if r.ok and r.json():
                    return r.json()[0]
                elif r.ok:
                    return {"id": session_id, "user_id": user_id, **patch}
            except Exception:  # noqa: BLE001
                pass

        db = _baca_lokal()
        for ses in db["sessions"]:
            if ses["id"] == session_id and ses.get("user_id") == user_id:
                ses.update(patch)
                _simpan_lokal(db)
                return ses
        return None

    def delete_session(self, user_id: str, session_id: str, access_token: str | None = None) -> bool:
        if not SUPABASE_OFFLINE and access_token and not access_token.startswith("local_"):
            try:
                r = HTTP.delete(
                    f"{SUPABASE_URL}/rest/v1/railuma_sessions?id=eq.{session_id}&user_id=eq.{user_id}",
                    headers=_headers(access_token),
                    timeout=3.0,
                )
                if r.ok:
                    return True
            except Exception:  # noqa: BLE001
                pass

        db = _baca_lokal()
        awal = len(db["sessions"])
        db["sessions"] = [s for s in db["sessions"] if not (s["id"] == session_id and s.get("user_id") == user_id)]
        if len(db["sessions"]) < awal:
            item_ids = {i["id"] for i in db["items"] if i["session_id"] == session_id}
            db["items"] = [i for i in db["items"] if i["session_id"] != session_id]
            db["revisions"] = [rv for rv in db["revisions"] if rv["item_id"] not in item_ids]
            db["corrections"] = [c for c in db["corrections"] if c["item_id"] not in item_ids]
            _simpan_lokal(db)
            return True
        return False

    def add_scan_item(
        self,
        user_id: str,
        session_id: str,
        payload: dict,
        access_token: str | None = None,
    ) -> dict | None:
        now = _now_iso()
        row = {
            "session_id": session_id,
            "mode": payload.get("mode", "photo"),
            "source": payload.get("source", "webcam"),
            "model_version": payload.get("model_version", "yolov8s@960"),
            "preprocess_version": payload.get("preprocess_version", "pp@1"),
            "status": payload.get("status", "done"),
            "quality_score": float(payload.get("quality_score", 0.0)),
            "sharpness": int(payload.get("sharpness", 0)),
            "glare_ratio": float(payload.get("glare_ratio", 0.0)),
            "pitch_px": float(payload.get("pitch_px", 0.0)),
            "skew_deg": float(payload.get("skew_deg", 0.0)),
            "quality_hints": payload.get("quality_hints", []),
            "confidence": float(payload.get("confidence", 0.0)),
            "raw_text": payload.get("raw_text", ""),
            "final_text": payload.get("final_text", ""),
            "cell_count": int(payload.get("cell_count", 0)),
            "image_url": payload.get("image_url"),
            "image_width": int(payload.get("image_width", 0)),
            "image_height": int(payload.get("image_height", 0)),
            "words_json": payload.get("words_json", []),
            "cells_json": payload.get("cells_json", []),
            "notes": payload.get("notes", ""),
        }
        if not SUPABASE_OFFLINE and access_token and not access_token.startswith("local_"):
            try:
                hdrs = _headers(access_token)
                r = HTTP.post(
                    f"{SUPABASE_URL}/rest/v1/railuma_scan_items",
                    headers=hdrs,
                    json=row,
                    timeout=8.0,
                )
                if r.ok and r.json():
                    item = r.json()[0]
                    rev_payload = {
                        "item_id": item["id"],
                        "revision_number": 1,
                        "author": "model",
                        "text_content": item["final_text"],
                        "note": "Hasil pindai awal model",
                    }
                    f_rev = _POOL.submit(
                        HTTP.post,
                        f"{SUPABASE_URL}/rest/v1/railuma_revisions",
                        headers=hdrs,
                        json=rev_payload,
                        timeout=4.0,
                    )
                    _POOL.submit(
                        HTTP.patch,
                        f"{SUPABASE_URL}/rest/v1/railuma_sessions?id=eq.{session_id}&user_id=eq.{user_id}",
                        headers=hdrs,
                        json={"updated_at": now},
                        timeout=4.0,
                    )
                    r_rev = f_rev.result()
                    item["revisions"] = r_rev.json() if (r_rev.ok and r_rev.json()) else [rev_payload]
                    return item
            except Exception:  # noqa: BLE001
                pass

        db = _baca_lokal()
        item_id = str(uuid.uuid4())
        item = {"id": item_id, **row, "created_at": now}
        rev = {
            "id": str(uuid.uuid4()),
            "item_id": item_id,
            "revision_number": 1,
            "author": "model",
            "text_content": item["final_text"],
            "note": "Hasil pindai awal model",
            "created_at": now,
        }
        db["items"].append(item)
        db["revisions"].append(rev)
        for s in db["sessions"]:
            if s["id"] == session_id and s.get("user_id") == user_id:
                s["updated_at"] = now
        _simpan_lokal(db)
        return {**item, "revisions": [rev]}

    def save_revision_and_correction(
        self,
        user_id: str,
        item_id: str,
        final_text: str,
        notes: str | None = None,
        cells_json: list | None = None,
        correction: dict | None = None,
        access_token: str | None = None,
    ) -> dict | None:
        now = _now_iso()
        if not SUPABASE_OFFLINE and access_token and not access_token.startswith("local_"):
            try:
                hdrs = _headers(access_token)
                patch_item: dict = {"final_text": final_text, "status": "done"}
                if notes is not None:
                    patch_item["notes"] = notes
                if cells_json is not None:
                    patch_item["cells_json"] = cells_json

                f_up = _POOL.submit(
                    HTTP.patch,
                    f"{SUPABASE_URL}/rest/v1/railuma_scan_items?id=eq.{item_id}",
                    headers=hdrs,
                    json=patch_item,
                    timeout=3.0,
                )
                f_revs = _POOL.submit(
                    HTTP.get,
                    f"{SUPABASE_URL}/rest/v1/railuma_revisions?item_id=eq.{item_id}&select=*&order=revision_number.asc",
                    headers=hdrs,
                    timeout=3.0,
                )
                r_up = f_up.result()
                r_revs = f_revs.result()
                if r_up.ok and r_up.json():
                    updated_item = r_up.json()[0]
                    revs = r_revs.json() if r_revs.ok else []
                    next_no = (revs[-1]["revision_number"] + 1) if revs else 1

                    rev_note = "Koreksi pengguna"
                    if correction and correction.get("cell_id"):
                        rev_note = f"Koreksi sel {correction['cell_id']}: {correction.get('from_symbol')} -> {correction.get('to_symbol')}"
                        _POOL.submit(
                            HTTP.post,
                            f"{SUPABASE_URL}/rest/v1/railuma_corrections",
                            headers=hdrs,
                            json={
                                "item_id": item_id,
                                "cell_id": str(correction["cell_id"]),
                                "from_symbol": str(correction.get("from_symbol", "")),
                                "to_symbol": str(correction.get("to_symbol", "")),
                                "from_pattern": str(correction.get("from_pattern", "")),
                                "to_pattern": str(correction.get("to_pattern", "")),
                                "consent_dataset": bool(correction.get("consent_dataset", False)),
                            },
                            timeout=2.5,
                        )

                    r_new_rev = HTTP.post(
                        f"{SUPABASE_URL}/rest/v1/railuma_revisions",
                        headers=hdrs,
                        json={
                            "item_id": item_id,
                            "revision_number": next_no,
                            "author": "user",
                            "text_content": final_text,
                            "note": rev_note,
                        },
                        timeout=2.5,
                    )
                    if r_new_rev.ok and r_new_rev.json():
                        revs.append(r_new_rev.json()[0])

                    if updated_item.get("session_id"):
                        _POOL.submit(
                            HTTP.patch,
                            f"{SUPABASE_URL}/rest/v1/railuma_sessions?id=eq.{updated_item['session_id']}&user_id=eq.{user_id}",
                            headers=hdrs,
                            json={"updated_at": now},
                            timeout=2.5,
                        )
                    updated_item["revisions"] = revs
                    return updated_item
            except Exception:  # noqa: BLE001
                pass

        db = _baca_lokal()
        user_session_ids = {s["id"] for s in db["sessions"] if s.get("user_id") == user_id}
        for it in db["items"]:
            if it["id"] == item_id and it["session_id"] in user_session_ids:
                it["final_text"] = final_text
                it["status"] = "done"
                if notes is not None:
                    it["notes"] = notes
                if cells_json is not None:
                    it["cells_json"] = cells_json
                revs = [rv for rv in db["revisions"] if rv["item_id"] == item_id]
                next_no = (revs[-1]["revision_number"] + 1) if revs else 1
                rev = {
                    "id": str(uuid.uuid4()),
                    "item_id": item_id,
                    "revision_number": next_no,
                    "author": "user",
                    "text_content": final_text,
                    "note": "Koreksi pengguna",
                    "created_at": now,
                }
                db["revisions"].append(rev)
                if correction and correction.get("cell_id"):
                    db["corrections"].append({
                        "id": str(uuid.uuid4()),
                        "item_id": item_id,
                        **correction,
                        "created_at": now,
                    })
                _simpan_lokal(db)
                return {**it, "revisions": revs + [rev]}
        return None

    def delete_scan_item(self, user_id: str, session_id: str, item_id: str, access_token: str | None = None) -> bool:
        if not SUPABASE_OFFLINE and access_token and not access_token.startswith("local_"):
            try:
                hdrs = _headers(access_token)
                r_del = HTTP.delete(
                    f"{SUPABASE_URL}/rest/v1/railuma_scan_items?id=eq.{item_id}&session_id=eq.{session_id}",
                    headers=hdrs,
                    timeout=3.0,
                )
                if r_del.ok:
                    _POOL.submit(
                        HTTP.delete,
                        f"{SUPABASE_URL}/rest/v1/railuma_revisions?item_id=eq.{item_id}",
                        headers=hdrs,
                        timeout=2.5,
                    )
                    return True
            except Exception:  # noqa: BLE001
                pass

        db = _baca_lokal()
        user_session_ids = {s["id"] for s in db["sessions"] if s.get("user_id") == user_id}
        if session_id not in user_session_ids:
            return False
        orig_len = len(db["items"])
        db["items"] = [it for it in db["items"] if not (it["id"] == item_id and it["session_id"] == session_id)]
        if len(db["items"]) < orig_len:
            db["revisions"] = [rv for rv in db["revisions"] if rv.get("item_id") != item_id]
            _simpan_lokal(db)
            return True
        return False


STORE = RailumaStore()
