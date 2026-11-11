"""API terjemahan dan Dasbor Sesi Braille Railuma v2 (FastAPI + YOLOv8 + Supabase Auth/RLS).

Jalankan:  uvicorn main:app --host 0.0.0.0 --port 8000
Variabel lingkungan (semua opsional):
  MODEL_PATH       lokasi bobot YOLO            (default: best.pt di folder ini)
  IMGSZ            ukuran input inferensi       (default: otomatis = imgsz training model, mis. 960)
  CONF / IOU       ambang deteksi               (default: 0.25 / 0.45)
  BLUR_MIN         ambang ketajaman             (default: 60)
  ALLOWED_ORIGINS  daftar origin dipisah koma   (default: *)
"""
from __future__ import annotations

import asyncio
import base64
import os
import secrets
import time

import cv2
import numpy as np
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ultralytics import YOLO

from braille_logic import baca_boxes, process_braille_detections  # noqa: F401
from koreksi import Kamus, koreksi_hasil
from preprocess import apply_clahe, assess_quality, is_blurry
from supabase_db import STORE

BASE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.getenv("MODEL_PATH", os.path.join(BASE, "best.pt"))
CONF = float(os.getenv("CONF", "0.25"))
IOU = float(os.getenv("IOU", "0.45"))
ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

app = FastAPI(title="Railuma v2 Braille API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("[INFO] Memuat model YOLO dan kamus KBBI...")
try:
    model = YOLO(MODEL_PATH)
except Exception as e:  # noqa: BLE001
    raise SystemExit(
        f"\n[GAGAL] Model '{MODEL_PATH}' tidak bisa dimuat: {e}\n"
        "Perbaiki dengan:  pip install -U ultralytics\n"
    ) from e


def _imgsz_training(default=960):
    try:
        return int(model.ckpt["train_args"]["imgsz"])
    except Exception:  # noqa: BLE001
        return default


def _nama_model() -> str:
    try:
        m_name = str(model.ckpt.get("train_args", {}).get("model", "yolov8s.pt")).replace(".pt", "")
        return f"{m_name}@{_imgsz_training()}"
    except Exception:  # noqa: BLE001
        return "yolov8s@960"


IMGSZ = int(os.getenv("IMGSZ") or _imgsz_training())
MODEL_VERSION = _nama_model()
KAMUS = Kamus(os.path.join(BASE, "kata_kbbi.txt"))
print(f"[INFO] Kamus: {len(KAMUS)} kata. Kelas model: {len(model.names)} ({MODEL_VERSION})")

PAIRING_TOKENS: dict[str, dict] = {}
PAIRING_SOCKETS: dict[str, set[WebSocket]] = {}


def jalankan(img, clahe=False, imgsz=None, conf=None, deskew=True):
    """Pipeline lengkap pada satu gambar BGR. Dipakai endpoint dan evaluate.py."""
    img_model = apply_clahe(img) if clahe else img
    r = model.predict(
        source=img_model,
        conf=CONF if conf is None else conf,
        iou=IOU,
        imgsz=imgsz or IMGSZ,
        agnostic_nms=True,
        max_det=500,
        verbose=False,
    )[0]
    hasil = baca_boxes(r.boxes, model.names, deskew=deskew)
    teks_final, kata_info = koreksi_hasil(hasil, KAMUS)
    boxes = []
    for b in r.boxes:
        x1, y1, x2, y2 = b.xyxy[0].tolist()
        boxes.append({
            "label": model.names[int(b.cls[0])],
            "conf": round(float(b.conf[0]), 3),
            "x1": round(x1, 1),
            "y1": round(y1, 1),
            "x2": round(x2, 1),
            "y2": round(y2, 1),
        })
    return {
        "raw_text": hasil.teks(),
        "final_text": teks_final,
        "words": kata_info,
        "boxes": boxes,
        "cells": hasil.sel_detail,
        "n_cells": hasil.n_sel,
        "mean_conf": round(hasil.konf_rata, 3),
        "skew_deg": round(hasil.sudut, 1),
        "pitch_px": round(hasil.pitch, 1),
        "model_version": MODEL_VERSION,
    }


def _buat_thumbnail_data_url(img_bgr, max_w=640) -> str:
    h, w = img_bgr.shape[:2]
    if w > max_w:
        skala = max_w / float(w)
        img_bgr = cv2.resize(img_bgr, (max_w, max(1, int(h * skala))), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", img_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 78])
    if not ok:
        return ""
    b64 = base64.b64encode(buf.tobytes()).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


def _extract_bearer(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Silakan masuk (login) terlebih dahulu untuk mengakses riwayat sesi.")
    return authorization.split(" ", 1)[1].strip()


def require_auth(token: str = Depends(_extract_bearer)) -> dict:
    user = STORE.get_user_from_token(token)
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="Sesi login berakhir atau tidak valid. Silakan masuk kembali.")
    return {**user, "token": token}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "kelas": len(model.names),
        "imgsz": IMGSZ,
        "conf": CONF,
        "model_version": MODEL_VERSION,
    }


@app.get("/api/v1/health")
def health_v1():
    return health()


@app.get("/labels")
def labels():
    return {"labels": {int(k): v for k, v in model.names.items()}}


@app.post("/translate/")
def translate_braille(
    file: UploadFile = File(...),
    clahe: bool = False,
    check_blur: bool = True,
):
    try:
        data = np.frombuffer(file.file.read(), np.uint8)
        img = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if img is None:
            return {"status": "error", "message": "File bukan gambar yang valid"}

        kualitas = assess_quality(img)
        buram, ketajaman = kualitas["is_blurry"], kualitas["sharpness"]
        if check_blur and buram:
            return {
                "status": "blurry",
                "sharpness": ketajaman,
                "quality": kualitas,
                "message": "Gambar buram atau terlalu dekat",
            }

        hasil = jalankan(img, clahe=clahe)
        hasil.update({
            "status": "success",
            "image_width": img.shape[1],
            "image_height": img.shape[0],
            "sharpness": ketajaman,
            "quality": kualitas,
            "clahe": clahe,
        })
        return hasil
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


class AuthRegisterReq(BaseModel):
    email: str
    password: str
    name: str = ""


class AuthLoginReq(BaseModel):
    email: str
    password: str


class SessionCreateReq(BaseModel):
    title: str = "Sesi Pindai Baru"


class SessionPatchReq(BaseModel):
    title: str | None = None
    pinned: bool | None = None


class ScanPatchReq(BaseModel):
    final_text: str
    notes: str | None = None
    cells_json: list | None = None
    correction: dict | None = None


class PairingCreateReq(BaseModel):
    session_id: str | None = None


@app.post("/api/v1/auth/register")
def api_auth_register(req: AuthRegisterReq):
    if "@" not in req.email or len(req.email.strip()) < 5:
        raise HTTPException(status_code=400, detail="Masukkan alamat email yang valid.")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Kata sandi minimal 6 karakter.")
    try:
        return STORE.register_user(req.email, req.password, req.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/api/v1/auth/login")
def api_auth_login(req: AuthLoginReq):
    try:
        return STORE.login_user(req.email, req.password)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e


@app.get("/api/v1/auth/providers")
def api_auth_providers():
    ext = STORE.external_providers()
    return {"google": bool(ext.get("google"))}


@app.get("/api/v1/auth/me")
def api_auth_me(auth: dict = Depends(require_auth)):
    return {"user": {"id": auth["id"], "email": auth["email"], "name": auth["name"]}}


@app.post("/api/v1/auth/logout")
def api_auth_logout(auth: dict = Depends(require_auth)):
    STORE.logout_user(auth["token"])
    return {"logged_out": True}


@app.get("/api/v1/sessions")
def api_list_sessions(auth: dict = Depends(require_auth)):
    return {"sessions": STORE.list_sessions(auth["id"], auth["token"])}


@app.post("/api/v1/sessions")
def api_create_session(req: SessionCreateReq, auth: dict = Depends(require_auth)):
    return STORE.create_session(auth["id"], req.title, auth["token"])


@app.get("/api/v1/sessions/{session_id}")
def api_get_session(session_id: str, auth: dict = Depends(require_auth)):
    ses = STORE.get_session_detail(auth["id"], session_id, auth["token"])
    if not ses:
        raise HTTPException(status_code=404, detail="Sesi tidak ditemukan atau bukan milik akun Anda.")
    return ses


@app.patch("/api/v1/sessions/{session_id}")
def api_patch_session(session_id: str, req: SessionPatchReq, auth: dict = Depends(require_auth)):
    ses = STORE.update_session(auth["id"], session_id, title=req.title, pinned=req.pinned, access_token=auth["token"])
    if not ses:
        raise HTTPException(status_code=404, detail="Sesi tidak ditemukan atau bukan milik akun Anda.")
    return ses


@app.delete("/api/v1/sessions/{session_id}")
def api_delete_session(session_id: str, auth: dict = Depends(require_auth)):
    ok = STORE.delete_session(auth["id"], session_id, auth["token"])
    if not ok:
        raise HTTPException(status_code=404, detail="Sesi tidak ditemukan atau bukan milik akun Anda.")
    return {"deleted": True}


@app.post("/api/v1/sessions/{session_id}/scans")
def api_create_scan(
    session_id: str,
    file: UploadFile = File(...),
    mode: str = Form("photo"),
    source: str = Form("webcam"),
    clahe: bool = Form(False),
    check_blur: bool = Form(True),
    save_image: bool = Form(False),
    override_final_text: str | None = Form(None),
    override_raw_text: str | None = Form(None),
    auth: dict = Depends(require_auth),
):
    data = np.frombuffer(file.file.read(), np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Berkas bukan gambar yang valid.")

    kualitas = assess_quality(img)
    if check_blur and kualitas["is_blurry"]:
        return {
            "status": "blurry",
            "sharpness": kualitas["sharpness"],
            "quality": kualitas,
            "message": "Gambar kurang tajam atau kamera terlalu dekat. Tahan stabil lalu pindai ulang.",
        }

    hasil = jalankan(img, clahe=clahe)
    final_txt = override_final_text if isinstance(override_final_text, str) else hasil["final_text"]
    raw_txt = override_raw_text if isinstance(override_raw_text, str) else hasil["raw_text"]

    perlu_tinjau = (
        hasil["mean_conf"] < 0.72
        or any(c.get("flag") == "review" for c in hasil["cells"])
        or any(w.get("ragu") for row in hasil["words"] for w in row)
    )
    status_item = "needs_review" if (perlu_tinjau and final_txt.strip()) else "done"

    thumb_url = _buat_thumbnail_data_url(img) if save_image else None

    saved = STORE.add_scan_item(
        user_id=auth["id"],
        session_id=session_id,
        payload={
            "mode": mode if mode in ("live", "sentence", "photo", "file") else "photo",
            "source": source if source in ("webcam", "phone", "upload") else "webcam",
            "model_version": MODEL_VERSION,
            "preprocess_version": "clahe@1" if clahe else "raw@1",
            "status": status_item,
            "quality_score": kualitas["score"],
            "sharpness": kualitas["sharpness"],
            "glare_ratio": kualitas["glare"],
            "pitch_px": hasil["pitch_px"],
            "skew_deg": hasil["skew_deg"],
            "quality_hints": kualitas["hints"],
            "confidence": hasil["mean_conf"],
            "raw_text": raw_txt,
            "final_text": final_txt,
            "cell_count": hasil["n_cells"],
            "image_url": thumb_url,
            "image_width": img.shape[1],
            "image_height": img.shape[0],
            "words_json": hasil["words"],
            "cells_json": hasil["cells"],
        },
        access_token=auth["token"],
    )
    if not saved:
        raise HTTPException(status_code=404, detail="Sesi tidak ditemukan atau bukan milik akun Anda.")

    return {
        "status": "success",
        "item": saved,
        "quality": kualitas,
    }


@app.patch("/api/v1/scans/{item_id}")
def api_patch_scan(item_id: str, req: ScanPatchReq, auth: dict = Depends(require_auth)):
    updated = STORE.save_revision_and_correction(
        user_id=auth["id"],
        item_id=item_id,
        final_text=req.final_text,
        notes=req.notes,
        cells_json=req.cells_json,
        correction=req.correction,
        access_token=auth["token"],
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Item pindai tidak ditemukan atau bukan milik akun Anda.")
    return {"status": "success", "item": updated}


@app.post("/api/v1/pairing")
def api_create_pairing(req: PairingCreateReq, auth: dict = Depends(require_auth)):
    now = time.time()
    for k in list(PAIRING_TOKENS.keys()):
        if PAIRING_TOKENS[k]["expires_at"] < now:
            PAIRING_TOKENS.pop(k, None)

    token = secrets.token_urlsafe(12)
    PAIRING_TOKENS[token] = {
        "token": token,
        "user_id": auth["id"],
        "session_id": req.session_id,
        "created_at": now,
        "expires_at": now + 86400,
    }
    return {
        "token": token,
        "expires_in_seconds": 86400,
    }


@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    """Menerima biner JPEG dari klien, menjalankan deteksi di thread pool, dan mengirim poligon sel."""
    await websocket.accept()
    clahe_mode = False
    try:
        while True:
            msg = await websocket.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            if "text" in msg and msg["text"]:
                import json
                try:
                    cfg = json.loads(msg["text"])
                    if cfg.get("type") == "config":
                        clahe_mode = bool(cfg.get("clahe", False))
                except Exception:  # noqa: BLE001
                    pass
                continue

            raw_bytes = msg.get("bytes")
            if not raw_bytes:
                continue

            t0 = time.perf_counter()

            def _proses_frame(b: bytes, pakai_clahe: bool):
                arr = np.frombuffer(b, np.uint8)
                im = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if im is None:
                    return None
                kual = assess_quality(im)
                hsl = jalankan(im, clahe=pakai_clahe)
                return {
                    "w": im.shape[1],
                    "h": im.shape[0],
                    "quality": kual,
                    "result": hsl,
                }

            out = await asyncio.to_thread(_proses_frame, raw_bytes, clahe_mode)
            ms = round((time.perf_counter() - t0) * 1000)
            if out is None:
                await websocket.send_json({"type": "error", "message": "Frame tidak valid"})
                continue

            hsl = out["result"]
            await websocket.send_json({
                "type": "cells",
                "latency_ms": ms,
                "image_width": out["w"],
                "image_height": out["h"],
                "quality": out["quality"],
                "raw_text": hsl["raw_text"],
                "final_text": hsl["final_text"],
                "mean_conf": hsl["mean_conf"],
                "skew_deg": hsl["skew_deg"],
                "pitch_px": hsl["pitch_px"],
                "cells": hsl["cells"],
                "words": hsl["words"],
            })
    except WebSocketDisconnect:
        pass


@app.websocket("/ws/device/{token}")
async def ws_device_pairing(websocket: WebSocket, token: str):
    """Kanal real-time antara kamera HP dan dasbor web yang berbagi token penyandingan."""
    info = PAIRING_TOKENS.get(token)
    now = time.time()
    if not info:
        # Jika server baru restart atau container baru, izinkan token yang valid formatnya
        if len(token) >= 8:
            info = {
                "token": token,
                "user_id": "auto",
                "session_id": None,
                "created_at": now,
                "expires_at": now + 86400,
            }
            PAIRING_TOKENS[token] = info
        else:
            await websocket.close(code=4004, reason="Token penyandingan tidak valid")
            return
    elif info["expires_at"] < now:
        info["expires_at"] = now + 86400

    await websocket.accept()
    ruang = PAIRING_SOCKETS.setdefault(token, set())
    ruang.add(websocket)
    try:
        for peer in list(ruang):
            try:
                await peer.send_json({"type": "peer_joined", "peers": len(ruang)})
            except Exception:
                pass

        while True:
            msg = await websocket.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            if "text" in msg and msg["text"]:
                txt = msg["text"]
                # Tangani heartbeat ping/pong agar koneksi tidak diputus idle timeout
                if txt == "ping" or '"type":"ping"' in txt or '"type": "ping"' in txt:
                    try:
                        await websocket.send_text('{"type":"pong"}')
                    except Exception:
                        pass
                    continue

                for peer in list(ruang):
                    if peer is not websocket:
                        try:
                            await peer.send_text(txt)
                        except Exception:
                            pass
            elif "bytes" in msg and msg["bytes"]:
                for peer in list(ruang):
                    if peer is not websocket:
                        try:
                            await peer.send_bytes(msg["bytes"])
                        except Exception:
                            pass
    except WebSocketDisconnect:
        pass
    finally:
        ruang.discard(websocket)
        for peer in list(ruang):
            try:
                await peer.send_json({"type": "peer_left", "peers": len(ruang)})
            except Exception:  # noqa: BLE001
                pass
