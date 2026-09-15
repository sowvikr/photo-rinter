"""Serve PhotoPrinter and run OpenCV face detection on the local computer."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import json
import cv2
import numpy as np
from io import BytesIO
from threading import Lock
from PIL import Image

_segment_session = None
_segment_lock = Lock()


def segment_person(data):
    """Return matted foreground RGB and alpha, retaining edge decontamination."""
    global _segment_session
    with Image.open(BytesIO(data)) as source:
        if max(source.size) > 1800:
            raise ValueError("Segmentation image must be at most 1800 pixels")
        image = source.convert("RGB")
    from rembg import new_session, remove
    with _segment_lock:
        if _segment_session is None:
            _segment_session = new_session("u2net_human_seg", providers=["CPUExecutionProvider"])
        cutout = remove(image, session=_segment_session, alpha_matting=True,
                        alpha_matting_foreground_threshold=240,
                        alpha_matting_background_threshold=10,
                        alpha_matting_erode_size=5)
    output = BytesIO()
    cutout.save(output, format="PNG")
    return output.getvalue()


def detect_faces(data):
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode photo")
    h, w = image.shape[:2]
    if w > 1800 or h > 1800:
        raise ValueError("Detection image must be resized to 1800 pixels or less")
    gray = cv2.equalizeHist(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY))
    detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = detector.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=6, minSize=(25, 25))
    return [{"x": int(x) / w, "y": int(y) / h, "width": int(fw) / w, "height": int(fh) / h}
            for x, y, fw, fh in sorted(faces, key=lambda f: int(f[2]) * int(f[3]), reverse=True)]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Start the local PhotoPrinter app")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    root = str(Path(__file__).resolve().parent)

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=root, **kwargs)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            super().end_headers()

        def do_GET(self):
            if self.path.split("?")[0] not in ("/", "/index.html", "/style.css", "/app.js", "/layout.js", "/background.js"):
                self.send_error(404)
                return
            super().do_GET()

        def do_POST(self):
            if self.path not in ("/detect", "/segment"):
                self.send_error(404)
                return
            if self.headers.get("Origin") != f"http://127.0.0.1:{args.port}":
                self.send_error(403)
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                limit = 15 * 1024 * 1024 if self.path == "/segment" else 5 * 1024 * 1024
                if not 0 < length <= limit:
                    raise ValueError("Invalid image size")
                data = self.rfile.read(length)
                if self.path == "/segment":
                    payload = segment_person(data)
                    content_type = "image/png"
                else:
                    payload = json.dumps({"faces": detect_faces(data)}).encode()
                    content_type = "application/json"
                self.send_response(200)
            except (ValueError, cv2.error):
                payload = json.dumps({"error": "The photo could not be processed."}).encode()
                content_type = "application/json"
                self.send_response(400)
            except Exception:
                payload = json.dumps({"error": "Background processing failed. Check the local model installation and try again."}).encode()
                content_type = "application/json"
                self.send_response(503)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"PhotoPrinter: http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
