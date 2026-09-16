# PhotoPrinter

A local full-body-photo → head-and-shoulders crop → printable photo sheet app.
No LLM is needed: OpenCV detects faces, the browser crops the original pixels,
and a deterministic layout algorithm places copies at physical dimensions.

## Run

With Python 3.11 or newer (tested with Python 3.12):

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python server.py
```

Open http://127.0.0.1:8000. On Windows use `.venv\Scripts\python.exe` instead.
Dependency installation requires internet once; normal operation works offline.
Background replacement offers three local models. **Portrait precision** uses
BiRefNet-Portrait and is recommended for ID photos and difficult hair edges; its
first use downloads roughly 973 MB. **Balanced** uses a newer, smaller 224 MB
BiRefNet model. **Fast** keeps the existing 176 MB U2Net model. To prepare the
recommended portrait model before working offline:

```sh
.venv/bin/python -c "from rembg import new_session; new_session('birefnet-portrait', providers=['CPUExecutionProvider'])"
```

Model weights are cached locally by rembg (normally under `~/.rembg/models`).
No photo is sent to the model download service.
If `.venv` is already installed, only the last command is needed.

## Workflow

1. Choose a JPEG, PNG, or WebP full-body photo with a clear front-facing face.
2. The app suggests a crop using local face detection. With multiple faces,
   select the intended person from the list, ordered left to right.
3. Check hair, chin, and shoulders in the preview. Adjust zoom and position.
   If detection misses the face, manual cropping remains available.
4. Set photo width/height in millimetres, copy count, paper size, margin, and gap.
5. Preview each sheet. Download the selected sheet as PNG, or print all sheets
   / save a PDF through the browser print dialog.

### Background replacement

Choose **Background → Replace with a color**, select a preset or any custom color,
choose an **Edge detection model**, and click **Separate person from background**.
The local model creates an alpha mask (a per-pixel opacity map), then foreground
color estimation removes the old background tint from uncertain boundaries.
The browser composites the original photo over your chosen color. This is not
generative editing: solid interior RGB comes from the full-resolution original.
At soft boundaries, the app retains the matting solver's cleaned foreground RGB
to reduce old-background color spill before blending with the selected color.
Segmentation input is lossless PNG to avoid introducing JPEG edge artifacts.

- **Edge strength** adjusts partially transparent edges; **Edge softness** blends
  their boundary. These controls do not change fully solid mask interiors.
- **Clean old background color at edges** is enabled by default. Disable it to
  compare the raw source colors. Extra softness defaults to zero because the
  matte already contains soft transitions; added blur can spread color fringes.
- **Refine with brush** opens a larger crop view. Use Restore person / Erase
  background, brush size, and 1×–3× view zoom for detailed corrections. Scroll
  within the editor to reach edges at higher zoom. Undo stores up to 10 strokes;
  Reset edits restores the model's mask.
- **Show original in crop preview only** compares against the source without
  changing sheet output. **Keep original** disables replacement in all outputs.
- The same mask and chosen color apply to previews, PNGs, and print/PDF output.
  Loading a different photo clears the previous mask and brush edits.

Precise results require checking hair, ears, and clothing. This model cannot
guarantee perfect edges on every photo. Mask processing is capped at 1800 pixels
on the longest side; opaque interiors still use the full-size original. Cleaned
edge colors use the processing resolution. Brush edits change opacity, not
facial geometry. Severe color spill or incorrect masks can still need correction.

For accurate size, choose the matching paper in the print dialog, **100% / Actual
size**, no browser margins, and no headers/footers. The configured page margin
is already included. Avoid “fit to page.” Check a first print with a ruler.
PNG exports contain 300-DPI-equivalent pixel dimensions, but PNG viewer software
may ignore the intended physical size; prefer the print/PDF flow for exact sizing.
Printer hardware margins still apply, especially with a zero margin setting.

## Components and data flow

- `server.py`: loopback-only static server, `POST /detect`, and `POST /segment`.
- `background.js`: color compositing, alpha-mask controls, and brush editor.
- `app.js`: image loading, crop controls, previews, exports, physical print layout.
- `layout.js`: compares all feasible mixtures of upright/rotated rows and columns;
  selects the highest copy count. This is a packing heuristic, not a mathematical
  guarantee of the global optimum among arbitrary rectangle arrangements.
- `index.html` / `style.css`: responsive interface and print styles.

The browser decodes the source and sends a reduced image (longest side ≤1800 px)
only to the local server. OpenCV returns normalized face rectangles. The browser
uses those rectangles to suggest a crop of the full-resolution source, then lays
out the copies. The printed crop is not generated, retouched, or enhanced.

No accounts, credentials, tokens, telemetry, external fonts, or cloud APIs are
used. Photos stay in browser/server memory and are not saved by the app. Only
explicit downloads or print-to-PDF create output files. Reloading clears the
working photo. The server binds to `127.0.0.1` and does not enable CORS.

## Limits

- Automatic framing is a suggestion. It does not verify official identity-photo
  rules or measure eyes/chin against a country's template.
- A small face in a full-body photo may lack sufficient pixels for a sharp ID
  print. The app reports effective crop DPI; exporting at 300 DPI cannot restore
  detail missing from the original.
- The classic frontal-face detector may miss angled/occluded faces or produce
  false detections. Always inspect the crop.
- Inputs are limited to 500 copies and 500 mm paper sides to bound resource use.
- PNG downloads export the currently selected sheet; print/PDF includes all copies.

Detector reference: [OpenCV cascade classifier documentation](https://docs.opencv.org/4.13.0/db/d28/tutorial_cascade_classifier.html).
Background model and matting API: [rembg](https://github.com/danielgatis/rembg).
The recommended portrait model is the portrait-specific BiRefNet variant listed
by rembg; BiRefNet performs high-resolution dichotomous image segmentation.

## Tests

```sh
node --test tests/layout.test.js
```

Tests cover fit, rotation, mixed layouts, bounds, spacing, and non-overlap.
An optional browser integration suite is in `tests/browser.cjs`; it requires
Playwright, Google Chrome, and a running local server. Run it with
`node tests/browser.cjs`. Set `PLAYWRIGHT_MODULE` if Playwright is installed
outside this project. `FACE_FIXTURE` optionally supplies a local face image for
testing successful detection; the default suite checks the no-face fallback
against the actual backend and uses controlled detections to check crop controls.
`node tests/background.cjs` checks color replacement, preservation of opaque
foreground pixels, brush/undo, comparison versus output, failure recovery, and
reset on a new photo using a deterministic test cutout. A pink-fringe regression
checks that cleaned edge RGB survives the server/browser contract while solid
interior pixels remain unchanged. It uses the same Playwright
setup as the browser suite.
