const $ = id => document.getElementById(id);
let photo = null, settings = null, cells = [], currentPage = 0, pageCount = 0;
let faces = [], loadVersion = 0;
const printStyle = document.createElement('style');
document.head.append(printStyle);
const number = id => Number($(id).value);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function readSettings() {
  for (const input of document.querySelectorAll('input[type=number]')) {
    if (!input.value || !input.checkValidity()) throw new Error(`Check ${document.querySelector(`label[for="${input.id}"]`).textContent.trim()}.`);
  }
  return {w: number('photo-width'), h: number('photo-height'), pw: number('paper-width'), ph: number('paper-height'), margin: number('margin'), gap: number('gap'), count: number('count'), rotate: $('rotate').checked, guides: $('guides').checked};
}

function cropRect() {
  const aspect = settings.w / settings.h;
  let w = Math.min(photo.naturalWidth, photo.naturalHeight * aspect) / number('zoom');
  let h = w / aspect;
  return {x: (photo.naturalWidth - w) * number('pan-x') / 100, y: (photo.naturalHeight - h) * number('pan-y') / 100, w, h};
}

function cropCanvas(dpi = 300, compare = false) {
  const c = document.createElement('canvas');
  c.width = Math.round(settings.w / 25.4 * dpi);
  c.height = Math.round(settings.h / 25.4 * dpi);
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  const r = cropRect();
  ctx.drawImage(photo, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  if (window.Background) window.Background.composite(c, r, compare);
  return c;
}

function paintSheet(canvas, dpi) {
  const scale = dpi / 25.4;
  canvas.width = Math.round(settings.pw * scale); canvas.height = Math.round(settings.ph * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const crop = cropCanvas(dpi);
  const start = currentPage * cells.length;
  for (const cell of cells.slice(0, Math.min(cells.length, settings.count - start))) {
    const x = (settings.margin + cell.x) * scale, y = (settings.margin + cell.y) * scale;
    ctx.save(); ctx.translate(x, y);
    if (cell.rotated) {ctx.translate(cell.width * scale, 0); ctx.rotate(Math.PI / 2);}
    ctx.drawImage(crop, 0, 0, settings.w * scale, settings.h * scale); ctx.restore();
    if (settings.guides) {ctx.strokeStyle = '#999'; ctx.lineWidth = .1 * scale; ctx.strokeRect(x, y, cell.width * scale, cell.height * scale);}
  }
}

function render() {
  $('status').textContent = '';
  $('print-pages').replaceChildren();
  try {
    settings = readSettings();
    cells = PhotoLayout.pack(settings.pw - settings.margin * 2, settings.ph - settings.margin * 2, settings.w, settings.h, settings.gap, settings.rotate);
    if (!cells.length) throw new Error('This photo does not fit inside the paper margins. Reduce the photo size or margins, or choose larger paper.');
    pageCount = Math.ceil(settings.count / cells.length);
    currentPage = clamp(currentPage, 0, pageCount - 1);
    $('capacity').textContent = cells.length;
    $('pages').textContent = pageCount;
    $('utilization').textContent = `${Math.round(cells.length * settings.w * settings.h / (settings.pw * settings.ph) * 100)}%`;
    $('paper-badge').textContent = `${settings.pw} × ${settings.ph} mm`;
    $('page-label').textContent = photo ? `Sheet ${currentPage + 1} of ${pageCount} · ${Math.min(cells.length, settings.count - currentPage * cells.length)} copies` : 'Sheet preview';
    $('prev').disabled = !photo || currentPage === 0;
    $('next').disabled = !photo || currentPage >= pageCount - 1;
    $('print').disabled = $('download').disabled = !photo;
    $('sheet-preview').hidden = !photo; $('empty-state').hidden = !!photo;
    if (!photo) return;
    const crop = cropCanvas(120, true), preview = $('crop-preview');
    preview.width = crop.width; preview.height = crop.height; preview.getContext('2d').drawImage(crop, 0, 0);
    const r = cropRect();
    const dpi = Math.floor(Math.min(r.w / settings.w, r.h / settings.h) * 25.4);
    $('resolution').textContent = `Cropped source: ${Math.round(r.w)} × ${Math.round(r.h)} px · ${dpi} effective DPI.${dpi < 300 ? ' Below 300 DPI; use a sharper original or a less tight crop for better print detail.' : ' Enough pixels for 300 DPI output.'}`;
    $('zoom-value').textContent = `${number('zoom').toFixed(2)}×`;
    paintSheet($('sheet-preview'), Math.min(85, 15000 / Math.max(settings.pw, settings.ph)));
  } catch (error) {
    $('status').textContent = error.message;
    $('print').disabled = $('download').disabled = $('prev').disabled = $('next').disabled = true;
    $('sheet-preview').hidden = true; $('capacity').textContent = $('pages').textContent = $('utilization').textContent = '—';
  }
}

function applyFace(index) {
  const face = faces[index];
  if (!face || !photo || !settings) return;
  // A suggested framing: face box occupies about 52% of crop height.
  const iw = photo.naturalWidth, ih = photo.naturalHeight, aspect = settings.w / settings.h;
  const baseW = Math.min(iw, ih * aspect);
  const desiredW = Math.max(face.height * ih * 1.95 * aspect, face.width * iw * 1.55);
  $('zoom').value = clamp(baseW / desiredW, 1, 20);
  const w = baseW / number('zoom'), h = w / aspect;
  const x = (face.x + face.width / 2) * iw - w / 2;
  const y = face.y * ih - face.height * ih * .38;
  $('pan-x').value = iw > w ? clamp(x / (iw - w) * 100, 0, 100) : 50;
  $('pan-y').value = ih > h ? clamp(y / (ih - h) * 100, 0, 100) : 50;
  render();
}

async function findFace() {
  if (!photo) return;
  const version = loadVersion;
  $('auto-crop').disabled = true;
  $('face-status').textContent = 'Finding faces on your computer…';
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1800 / Math.max(photo.naturalWidth, photo.naturalHeight));
    canvas.width = Math.round(photo.naturalWidth * scale); canvas.height = Math.round(photo.naturalHeight * scale);
    canvas.getContext('2d').drawImage(photo, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .92));
    const response = await fetch('/detect', {method: 'POST', headers: {'Content-Type': 'image/jpeg'}, body: blob});
    if (!response.ok) throw new Error('Local face detection is unavailable. Start the app with server.py, or use the crop sliders.');
    const result = await response.json();
    if (version !== loadVersion) return;
    faces = result.faces.sort((a, b) => a.x - b.x);
    $('face-select').replaceChildren(...faces.map((face, i) => new Option(`Face ${i + 1}${faces.length === 1 ? '' : ' · left to right'}`, i)));
    $('face-choice').hidden = faces.length < 2;
    if (!faces.length) {$('face-status').textContent = 'No face found. Use zoom and position to frame the head and shoulders manually.'; return;}
    $('face-status').textContent = faces.length > 1 ? `${faces.length} faces found. Choose the intended person and check the crop.` : 'Face found. Check that all hair, chin, and shoulders are framed correctly.';
    applyFace(0);
  } catch (error) {if (version === loadVersion) $('face-status').textContent = error.message;}
  finally {if (version === loadVersion) $('auto-crop').disabled = false;}
}

$('upload').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  const version = ++loadVersion;
  if (file.size > 30 * 1024 * 1024) {$('status').textContent = 'Choose a photo smaller than 30 MB.'; return;}
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    if (version !== loadVersion) return;
    photo = img; faces = []; currentPage = 0;
    if (window.Background) window.Background.reset();
    $('file-name').textContent = file.name; $('crop-controls').hidden = false; $('face-choice').hidden = true;
    $('zoom').value = 1; $('pan-x').value = $('pan-y').value = 50;
    render(); await findFace();
  } catch { $('status').textContent = 'This image could not be opened. Choose a JPEG, PNG, or WebP photo.'; }
  finally {URL.revokeObjectURL(url);}
});
$('zoom').max = 20;
for (const id of ['zoom', 'pan-x', 'pan-y', 'count', 'margin', 'gap', 'rotate', 'guides']) $(id).addEventListener('input', render);
for (const kind of ['photo', 'paper']) {
  $(kind + '-preset').addEventListener('change', () => {
    const value = $(kind + '-preset').value;
    if (value !== 'custom') [$(kind + '-width').value, $(kind + '-height').value] = value.split(',');
    render();
  });
  for (const dim of ['width', 'height']) $(kind + '-' + dim).addEventListener('input', () => {$(kind + '-preset').value = 'custom'; render();});
}
$('reset-crop').onclick = () => {$('zoom').value = 1; $('pan-x').value = $('pan-y').value = 50; render();};
$('auto-crop').onclick = findFace;
$('face-select').onchange = () => applyFace(Number($('face-select').value));
$('prev').onclick = () => {currentPage--; render();};
$('next').onclick = () => {currentPage++; render();};
$('download').onclick = () => {
  const canvas = document.createElement('canvas'); paintSheet(canvas, 300);
  canvas.toBlob(blob => {
    if (!blob) {$('status').textContent = 'Could not export this sheet.'; return;}
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `photo-sheet-${currentPage + 1}-${settings.pw}x${settings.ph}mm.png`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
};
function preparePrint() {
  if (!photo || $('print').disabled) return;
  printStyle.textContent = `@page {size:${settings.pw}mm ${settings.ph}mm; margin:0;}`;
  const source = cropCanvas().toDataURL('image/png');
  $('print-pages').replaceChildren();
  for (let page = 0; page < pageCount; page++) {
    const sheet = document.createElement('div'); sheet.className = 'print-sheet';
    sheet.style.width = `${settings.pw}mm`; sheet.style.height = `${settings.ph}mm`;
    for (const cell of cells.slice(0, Math.min(cells.length, settings.count - page * cells.length))) {
      const img = new Image(); img.src = source; img.className = 'print-photo' + (settings.guides ? ' cut-outline' : '');
      Object.assign(img.style, {left: `${settings.margin + cell.x}mm`, top: `${settings.margin + cell.y}mm`, width: `${settings.w}mm`, height: `${settings.h}mm`});
      if (cell.rotated) {img.style.transformOrigin = '0 0'; img.style.transform = `translateX(${cell.width}mm) rotate(90deg)`;}
      sheet.append(img);
    }
    $('print-pages').append(sheet);
  }
}
window.addEventListener('beforeprint', preparePrint);
$('print').onclick = async () => {
  preparePrint();
  await Promise.all(Array.from($('print-pages').querySelectorAll('img'), img => img.decode()));
  window.print();
};
render();
