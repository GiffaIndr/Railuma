"""Latih ulang model Braille (jalankan di Google Colab atau mesin ber-GPU).

Perbedaan penting dari notebook lama:
  * fliplr=0, flipud=0  -> TIDAK ADA cermin. Notebook lama memakai bawaan Ultralytics
    (fliplr=0.5): setengah gambar training dicerminkan, padahal cermin mengubah huruf Braille
    (d<->f, e<->i, h<->j, r<->w). Ini kemungkinan penyebab terbesar salah baca.
  * imgsz=960 dan yolov8s : titik Braille kecil, butuh resolusi dan kapasitas lebih besar.
  * augmentasi cahaya/bayangan/rotasi kecil agar tahan kondisi kamera nyata.
  * API key tidak ditulis di kode. Simpan di Colab: Secrets -> ROBOFLOW_API_KEY
    (atau variabel lingkungan ROBOFLOW_API_KEY).

Di Roboflow, cek juga: Generate -> Augmentation -> JANGAN pakai Flip.
Setelah selesai, set IMGSZ=960 saat menjalankan API: IMGSZ=960 uvicorn main:app
"""
import glob
import os

from ultralytics import YOLO


def ambil_api_key() -> str:
    key = os.getenv("ROBOFLOW_API_KEY")
    if key:
        return key
    try:
        from google.colab import userdata  # type: ignore
        return userdata.get("ROBOFLOW_API_KEY")
    except Exception as e:  # noqa: BLE001
        raise SystemExit("Set ROBOFLOW_API_KEY (Colab Secrets atau variabel lingkungan).") from e


def unduh_dataset():
    from roboflow import Roboflow
    rf = Roboflow(api_key=ambil_api_key())
    return rf.workspace("braille-sight-s6rpk").project("braille-okym2").version(1).download("yolov8")


def main():
    dataset = unduh_dataset()
    model = YOLO("yolov8s.pt")
    model.train(
        data=f"{dataset.location}/data.yaml",
        epochs=100, patience=30, imgsz=960, batch=16, plots=True,
        # --- JANGAN cerminkan Braille ---
        fliplr=0.0, flipud=0.0,
        # --- variasi kondisi kamera nyata ---
        hsv_h=0.0, hsv_s=0.4, hsv_v=0.5,   # cahaya redup/terang; warna tidak penting
        degrees=5.0, perspective=0.0005,    # kertas sedikit miring/serong
        scale=0.4, translate=0.1,
        mosaic=1.0, close_mosaic=15, mixup=0.0,
    )
    terbaik = sorted(glob.glob("runs/**/weights/best.pt", recursive=True), key=os.path.getmtime)[-1]
    print("Bobot terbaik:", terbaik)
    # Evaluasi pada split test bila ada
    try:
        YOLO(terbaik).val(data=f"{dataset.location}/data.yaml", split="test", imgsz=960)
    except Exception as e:  # noqa: BLE001
        print("Split test tidak tersedia:", e)
    print("Salin file itu menjadi best.pt di folder API, lalu jalankan: python inspect_model.py")


if __name__ == "__main__":
    main()
