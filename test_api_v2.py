"""Tes integrasi langsung untuk fungsi endpoint /api/v1, autentikasi per user, pipeline YOLO, dan penyimpanan sesi."""
import io
import os
import uuid

os.environ["SUPABASE_OFFLINE"] = "1"

from fastapi import HTTPException, UploadFile
import main

h = main.health_v1()
assert h["status"] == "ok", h
print("OK    /api/v1/health ->", h)

suffix = uuid.uuid4().hex[:6]
email_a = f"guru_a_{suffix}@sekolah.id"
email_b = f"guru_b_{suffix}@sekolah.id"

reg_a = main.api_auth_register(main.AuthRegisterReq(name="Guru A", email=email_a, password="password123"))
assert reg_a["access_token"] and reg_a["user"]["email"] == email_a, reg_a
user_a = {**reg_a["user"], "token": reg_a["access_token"]}

reg_b = main.api_auth_register(main.AuthRegisterReq(name="Guru B", email=email_b, password="password123"))
user_b = {**reg_b["user"], "token": reg_b["access_token"]}

login_a = main.api_auth_login(main.AuthLoginReq(email=email_a, password="password123"))
assert login_a["user"]["id"] == user_a["id"], login_a
print("OK    Daftar & Masuk Akun ->", user_a["email"], "&", user_b["email"])

ses = main.api_create_session(main.SessionCreateReq(title="Sesi Uji Guru A"), auth=user_a)
ses_id = ses["id"]
assert ses["user_id"] == user_a["id"], ses
print("OK    Buat sesi milik Guru A ->", ses_id, ses["title"])

# Pastikan Guru B tidak bisa melihat atau mengakses sesi milik Guru A
list_b = main.api_list_sessions(auth=user_b)
assert all(s["id"] != ses_id for s in list_b["sessions"]), "Isolasi sesi per user bocor!"
try:
    main.api_get_session(ses_id, auth=user_b)
    raise AssertionError("Guru B seharusnya tidak bisa membuka sesi Guru A")
except HTTPException as exc:
    assert exc.status_code == 404
print("OK    Isolasi riwayat per user terverifikasi (Guru B tidak bisa melihat sesi Guru A)")

with open("test_image.png", "rb") as f:
    raw = f.read()

up = UploadFile(filename="test_image.png", file=io.BytesIO(raw))
scan_res = main.api_create_scan(
    session_id=ses_id,
    file=up,
    mode="photo",
    source="upload",
    clahe=False,
    check_blur=False,
    save_image=False,
    override_final_text=None,
    override_raw_text=None,
    auth=user_a,
)
assert scan_res["status"] == "success", scan_res
item = scan_res["item"]
print("OK    Simpan scan ke sesi -> sel:", item["cell_count"], "teks:", repr(item["final_text"]))

item_id = item["id"]
patch_res = main.api_patch_scan(
    item_id=item_id,
    req=main.ScanPatchReq(
        final_text="hasil revisi uji",
        notes="Catatan uji otomatis",
        correction={
            "cell_id": "c0",
            "from_symbol": "a",
            "to_symbol": "b",
            "from_pattern": "1",
            "to_pattern": "12",
            "consent_dataset": True,
        },
    ),
    auth=user_a,
)
assert patch_res["status"] == "success", patch_res
revs = patch_res["item"]["revisions"]
assert len(revs) >= 2, revs
print("OK    Simpan revisi & koreksi sel -> jumlah revisi:", len(revs))

pair_res = main.api_create_pairing(main.PairingCreateReq(session_id=ses_id), auth=user_a)
assert pair_res.get("token"), pair_res
print("OK    Token penyandingan HP ->", pair_res["token"])

del_res = main.api_delete_session(ses_id, auth=user_a)
assert del_res["deleted"] is True
print("OK    Hapus sesi uji -> bersih")
print("\nSEMUA TES API, AUTENTIKASI PER USER, & PIPELINE LULUS")
