"""Autentikasi Supabase Auth & lapisan persistensi sesi per user_id (RLS-aware + fallback lokal)."""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import uuid
from datetime import datetime, timezone

import requests

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://rkcvkddbccpmhodryspm.supabase.co").rstrip("/")
SUPABASE_OFFLINE = os.getenv("SUPABASE_OFFLINE", "0") == "1"
SUPABASE_KEY = os.getenv(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrY3ZrZGRiY2NwbWhvZHJ5c3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MTkyMjQsImV4cCI6MjEwNzE5NTIyNH0.vg1ZOQ9SBEBsRiKkDGsgZH-mocGVFcdyFuoFHaT0Ots",
)

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


class RailumaStore:
    """Mengelola Supabase Auth (GoTrue) dan CRUD RLS per user_id ke public.railuma_*."""

    def register_user(self, email: str, password: str, name: str = "") -> dict:
        clean_email = email.strip().lower()
        clean_name = name.strip() or clean_email.split("@")[0]

        if not SUPABASE_OFFLINE:
            try:
                r = requests.post(
                    f"{SUPABASE_URL}/auth/v1/signup",
                    headers=_headers(),
                    json={
                        "email": clean_email,
                        "password": password,
                        "data": {"name": clean_name},
                    },
                    timeout=3.0,
                )
                if r.status_code >= 400:
                    msg = r.json().get("msg") or r.json().get("error_description") or r.json().get("message") or "Pendaftaran gagal."
                    raise ValueError(msg)
                body = r.json()
                access_token = body.get("access_token")
                user_obj = body.get("user") or body
                if not access_token:
                    return self.login_user(clean_email, password)
                return {
                    "access_token": access_token,
                    "user": {
                        "id": user_obj.get("id"),
                        "email": user_obj.get("email", clean_email),
                        "name": (user_obj.get("user_metadata") or {}).get("name") or clean_name,
                    },
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
            "user": {"id": user_id, "email": clean_email, "name": clean_name},
        }

    def login_user(self, email: str, password: str) -> dict:
        clean_email = email.strip().lower()
        if not SUPABASE_OFFLINE:
            try:
                r = requests.post(
                    f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                    headers=_headers(),
                    json={"email": clean_email, "password": password},
                    timeout=3.0,
                )
                if r.status_code >= 400:
                    msg = r.json().get("error_description") or r.json().get("msg") or "Email atau kata sandi salah."
                    raise ValueError(msg)
                body = r.json()
                user_obj = body.get("user") or {}
                return {
                    "access_token": body["access_token"],
                    "user": {
                        "id": user_obj.get("id"),
                        "email": user_obj.get("email", clean_email),
                        "name": (user_obj.get("user_metadata") or {}).get("name") or clean_email.split("@")[0],
                    },
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
                return {"access_token": token, "user": info}
        raise ValueError("Email atau kata sandi tidak cocok.")

    def get_user_from_token(self, access_token: str | None) -> dict | None:
        if not access_token:
            return None
        if not SUPABASE_OFFLINE and not access_token.startswith("local_"):
            try:
                r = requests.get(
                    f"{SUPABASE_URL}/auth/v1/user",
                    headers=_headers(access_token),
                    timeout=2.0,
                )
                if r.ok:
                    u = r.json()
                    email = u.get("email", "")
                    return {
                        "id": u.get("id"),
                        "email": email,
                        "name": (u.get("user_metadata") or {}).get("name") or email.split("@")[0],
                    }
                return None
            except Exception:  # noqa: BLE001
                pass

        db = _baca_lokal()
        return db.get("tokens", {}).get(access_token)

    def logout_user(self, access_token: str | None) -> None:
        if not access_token:
            return
        if not SUPABASE_OFFLINE and not access_token.startswith("local_"):
            try:
                requests.post(
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
        if not SUPABASE_OFFLINE and access_token and not access_token.startswith("local_"):
            try:
                r = requests.get(
                    f"{SUPABASE_URL}/rest/v1/railuma_sessions?user_id=eq.{user_id}&select=*&order=pinned.desc,updated_at.desc",
                    headers=_headers(access_token),
                    timeout=2.0,
                )
                if r.ok:
                    sessions = r.json()
                    r_items = requests.get(
                        f"{SUPABASE_URL}/rest/v1/railuma_scan_items?select=id,session_id,final_text,status,confidence,created_at&order=created_at.desc",
                        headers=_headers(access_token),
                        timeout=2.0,
                    )
                    items = r_items.json() if r_items.ok else []
                    by_ses: dict[str, list] = {}
                    for it in items:
                        by_ses.setdefault(it["session_id"], []).append(it)
                    for s in sessions:
                        daftar = by_ses.get(s["id"], [])
                        s["scan_count"] = len(daftar)
                        s["last_preview"] = daftar[0]["final_text"] if daftar else ""
                        s["needs_review_count"] = sum(1 for x in daftar if x.get("status") == "needs_review")
                    return sessions
            except Exception:  # noqa: BLE001
                pass

        db = _baca_lokal()
        sessions = [s for s in db["sessions"] if s.get("user_id") == user_id]
        sessions.sort(
            key=lambda x: (bool(x.get("pinned")), x.get("updated_at", "")),
            reverse=True,
        )
        for s in sessions:
            daftar = [i for i in db["items"] if i["session_id"] == s["id"]]
            s["scan_count"] = len(daftar)
            s["last_preview"] = daftar[-1]["final_text"] if daftar else ""
            s["needs_review_count"] = sum(1 for x in daftar if x.get("status") == "needs_review")
        return sessions

    def create_session(self, user_id: str, title: str = "Sesi Pindai Baru", access_token: str | None = None) -> dict:
        judul = (title or "Sesi Pindai Baru").strip()[:120]
        payload = {"user_id": user_id, "title": judul, "pinned": False}
        if not SUPABASE_OFFLINE and access_token and not access_token.startswith("local_"):
            try:
                r = requests.post(
                    f"{SUPABASE_URL}/rest/v1/railuma_sessions",
                    headers=_headers(access_token),
                    json=payload,
                    timeout=2.0,
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
        if not SUPABASE_OFFLINE and access_token and not access_token.startswith("local_"):
            try:
                r = requests.get(
                    f"{SUPABASE_URL}/rest/v1/railuma_sessions?id=eq.{session_id}&user_id=eq.{user_id}&select=*",
                    headers=_headers(access_token),
                    timeout=2.0,
                )
                if r.ok and r.json():
                    ses = r.json()[0]
                    r_it = requests.get(
                        f"{SUPABASE_URL}/rest/v1/railuma_scan_items?session_id=eq.{session_id}&select=*&order=created_at.asc",
                        headers=_headers(access_token),
                        timeout=2.0,
                    )
                    items = r_it.json() if r_it.ok else []
                    if items:
                        ids_str = ",".join(i["id"] for i in items)
                        r_rev = requests.get(
                            f"{SUPABASE_URL}/rest/v1/railuma_revisions?item_id=in.({ids_str})&select=*&order=revision_number.asc",
                            headers=_headers(access_token),
                            timeout=2.0,
                        )
                        revs = r_rev.json() if r_rev.ok else []
                        by_item: dict[str, list] = {}
                        for rv in revs:
                            by_item.setdefault(rv["item_id"], []).append(rv)
                        for it in items:
                            it["revisions"] = by_item.get(it["id"], [])
                    ses["items"] = items
                    return ses
            except Exception:  # noqa: BLE001
                pass

        db = _baca_lokal()
        for ses in db["sessions"]:
            if ses["id"] == session_id and ses.get("user_id") == user_id:
                items = [i for i in db["items"] if i["session_id"] == session_id]
                for it in items:
                    it["revisions"] = [rv for rv in db["revisions"] if rv["item_id"] == it["id"]]
                return {**ses, "items": items}
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
                r = requests.patch(
                    f"{SUPABASE_URL}/rest/v1/railuma_sessions?id=eq.{session_id}&user_id=eq.{user_id}",
                    headers=_headers(access_token),
                    json=patch,
                    timeout=2.0,
                )
                if r.ok and r.json():
                    return r.json()[0]
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
                r = requests.delete(
                    f"{SUPABASE_URL}/rest/v1/railuma_sessions?id=eq.{session_id}&user_id=eq.{user_id}",
                    headers=_headers(access_token),
                    timeout=2.0,
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
        # Pastikan sesi memang milik user_id
        ses = self.get_session_detail(user_id, session_id, access_token)
        if not ses:
            return None

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
                r = requests.post(
                    f"{SUPABASE_URL}/rest/v1/railuma_scan_items",
                    headers=_headers(access_token),
                    json=row,
                    timeout=2.5,
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
                    r_rev = requests.post(
                        f"{SUPABASE_URL}/rest/v1/railuma_revisions",
                        headers=_headers(access_token),
                        json=rev_payload,
                        timeout=2.0,
                    )
                    item["revisions"] = r_rev.json() if (r_rev.ok and r_rev.json()) else [rev_payload]

                    requests.patch(
                        f"{SUPABASE_URL}/rest/v1/railuma_sessions?id=eq.{session_id}&user_id=eq.{user_id}",
                        headers=_headers(access_token),
                        json={"updated_at": now},
                        timeout=2.0,
                    )
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
                r_get = requests.get(
                    f"{SUPABASE_URL}/rest/v1/railuma_scan_items?id=eq.{item_id}&select=*",
                    headers=_headers(access_token),
                    timeout=2.0,
                )
                if r_get.ok and r_get.json():
                    current = r_get.json()[0]
                    r_revs = requests.get(
                        f"{SUPABASE_URL}/rest/v1/railuma_revisions?item_id=eq.{item_id}&select=*&order=revision_number.asc",
                        headers=_headers(access_token),
                        timeout=2.0,
                    )
                    revs = r_revs.json() if r_revs.ok else []
                    next_no = (revs[-1]["revision_number"] + 1) if revs else 1

                    patch_item: dict = {"final_text": final_text, "status": "done"}
                    if notes is not None:
                        patch_item["notes"] = notes
                    if cells_json is not None:
                        patch_item["cells_json"] = cells_json

                    r_up = requests.patch(
                        f"{SUPABASE_URL}/rest/v1/railuma_scan_items?id=eq.{item_id}",
                        headers=_headers(access_token),
                        json=patch_item,
                        timeout=2.0,
                    )
                    updated_item = r_up.json()[0] if (r_up.ok and r_up.json()) else {**current, **patch_item}

                    rev_note = "Koreksi pengguna"
                    if correction and correction.get("cell_id"):
                        rev_note = f"Koreksi sel {correction['cell_id']}: {correction.get('from_symbol')} -> {correction.get('to_symbol')}"
                        requests.post(
                            f"{SUPABASE_URL}/rest/v1/railuma_corrections",
                            headers=_headers(access_token),
                            json={
                                "item_id": item_id,
                                "cell_id": str(correction["cell_id"]),
                                "from_symbol": str(correction.get("from_symbol", "")),
                                "to_symbol": str(correction.get("to_symbol", "")),
                                "from_pattern": str(correction.get("from_pattern", "")),
                                "to_pattern": str(correction.get("to_pattern", "")),
                                "consent_dataset": bool(correction.get("consent_dataset", False)),
                            },
                            timeout=2.0,
                        )

                    r_new_rev = requests.post(
                        f"{SUPABASE_URL}/rest/v1/railuma_revisions",
                        headers=_headers(access_token),
                        json={
                            "item_id": item_id,
                            "revision_number": next_no,
                            "author": "user",
                            "text_content": final_text,
                            "note": rev_note,
                        },
                        timeout=2.0,
                    )
                    if r_new_rev.ok and r_new_rev.json():
                        revs.append(r_new_rev.json()[0])

                    requests.patch(
                        f"{SUPABASE_URL}/rest/v1/railuma_sessions?id=eq.{current['session_id']}&user_id=eq.{user_id}",
                        headers=_headers(access_token),
                        json={"updated_at": now},
                        timeout=2.0,
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


STORE = RailumaStore()
