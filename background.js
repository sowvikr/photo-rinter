/* Original RGB inside the person; matted foreground RGB only at soft edges. */
(() => {
  let mask = null, initial = null, effective = null, history = [], generation = 0;
  let edgeColors = null;
  let drawing = false, lastPoint = null;
  const canvas = (w, h) => Object.assign(document.createElement('canvas'), {width:w, height:h});
  const enabled = () => mask && $('background-mode').value === 'color';
  function updateMask() {
    effective = null;
    if (!mask) return;
    effective = canvas(mask.width, mask.height);
    const ctx = effective.getContext('2d');
    const pixels = mask.getContext('2d').getImageData(0, 0, mask.width, mask.height);
    const shift = number('edge-shift');
    for (let i = 3; i < pixels.data.length; i += 4) {
      const a = pixels.data[i];
      // Keep fully opaque/transparent areas unchanged; refine only uncertain edges.
      pixels.data[i] = a === 0 || a === 255 ? a : clamp(a + shift, 0, 255);
    }
    ctx.putImageData(pixels, 0, 0);
    $('edge-shift-value').textContent = shift;
    $('edge-feather-value').textContent = `${number('edge-feather')} px`;
  }
  function composite(target, r, compare = false) {
    if (!enabled() || (compare && $('background-compare').checked)) return;
    if (!effective) updateMask();
    const maskCrop = canvas(target.width, target.height), mctx = maskCrop.getContext('2d');
    const sx = mask.width / photo.naturalWidth, sy = mask.height / photo.naturalHeight;
    const blur = number('edge-feather') * target.width / (r.w * sx);
    if (blur > 0) mctx.filter = `blur(${blur}px)`;
    // Overscan prevents softening the outside border of the output crop.
    const pad = Math.ceil(blur * 3 + 2);
    mctx.drawImage(effective, r.x*sx-pad*r.w*sx/target.width, r.y*sy-pad*r.h*sy/target.height,
      r.w*sx*(1+2*pad/target.width), r.h*sy*(1+2*pad/target.height),
      -pad, -pad, target.width+2*pad, target.height+2*pad);
    const ctx = target.getContext('2d');
    if (edgeColors && $('edge-cleanup').checked) {
      // Matting estimates the foreground without the old background's tint.
      // Opaque interiors still use full-resolution source RGB.
      ctx.drawImage(edgeColors, r.x*sx, r.y*sy, r.w*sx, r.h*sy, 0, 0, target.width, target.height);
    }
    ctx.save(); ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(maskCrop, 0, 0);
    ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = $('background-color').value;
    ctx.fillRect(0, 0, target.width, target.height); ctx.restore();
  }
  function redraw() {render(); if ($('mask-editor').open) drawEditor();}
  function reset() {
    generation++; mask = initial = effective = edgeColors = null; history = [];
    $('background-refine').hidden = true; $('remove-background').disabled = !photo;
    $('background-status').textContent = photo ? 'Ready to separate the person. Processing stays on this computer.' : 'Choose a photo first.';
    $('edge-shift').value = 0; $('edge-feather').value = 0; $('background-compare').checked = false;
    $('edge-cleanup').checked = true;
    $('undo-mask').disabled = true;
    if ($('mask-editor').open) $('mask-editor').close();
  }
  async function separate() {
    if (!photo) return;
    const token = ++generation, version = loadVersion;
    $('remove-background').disabled = true;
    $('background-status').textContent = 'Separating the person and refining hair edges… First use can take longer while the model loads.';
    try {
      const scale = Math.min(1, 1800 / Math.max(photo.naturalWidth, photo.naturalHeight));
      const input = canvas(Math.round(photo.naturalWidth * scale), Math.round(photo.naturalHeight * scale));
      input.getContext('2d').drawImage(photo, 0, 0, input.width, input.height);
      const blob = await new Promise(resolve => input.toBlob(resolve, 'image/png'));
      const response = await fetch('/segment', {method:'POST', headers:{'Content-Type':'image/png'}, body:blob});
      if (!response.ok) throw new Error((await response.json()).error || 'Background processing failed.');
      const image = await createImageBitmap(await response.blob());
      if (token !== generation || version !== loadVersion) {image.close(); return;}
      mask = canvas(image.width, image.height);
      const ctx = mask.getContext('2d'); ctx.drawImage(image, 0, 0); image.close();
      const pixels = ctx.getImageData(0, 0, mask.width, mask.height);
      edgeColors = canvas(mask.width, mask.height);
      const cleaned = new ImageData(new Uint8ClampedArray(pixels.data), mask.width, mask.height);
      for (let i=0; i<pixels.data.length; i+=4) {
        const alpha = pixels.data[i+3];
        // Fade the RGB correction out before reaching solid interiors.
        cleaned.data[i+3] = alpha > 0 ? clamp((250-alpha)/10, 0, 1)*255 : 0;
        pixels.data[i] = pixels.data[i+1] = pixels.data[i+2] = 255;
      }
      edgeColors.getContext('2d').putImageData(cleaned, 0, 0);
      ctx.putImageData(pixels, 0, 0); initial = ctx.getImageData(0, 0, mask.width, mask.height); history = [];
      $('undo-mask').disabled = true; $('background-compare').checked = false;
      $('background-refine').hidden = false;
      $('background-status').textContent = 'Background ready. Inspect hair, ears, and shoulders; use the brush to fix any missed areas.';
      updateMask(); redraw();
    } catch (error) {
      if (token === generation && version === loadVersion) $('background-status').textContent = error.message;
    } finally {if (token === generation) $('remove-background').disabled = false;}
  }
  function drawEditor() {
    if (!photo || !mask) return;
    const output = cropCanvas(300), view = $('mask-canvas');
    view.width = output.width; view.height = output.height;
    view.getContext('2d').drawImage(output, 0, 0);
    const width = Math.min(560, Math.max(220, window.innerWidth - 100)) * number('editor-zoom');
    view.style.width = `${width}px`; view.style.height = `${width * output.height / output.width}px`;
  }
  function point(event) {
    const rect = $('mask-canvas').getBoundingClientRect(), crop = cropRect();
    return {x:(crop.x + (event.clientX-rect.left)/rect.width*crop.w)*mask.width/photo.naturalWidth,
      y:(crop.y+(event.clientY-rect.top)/rect.height*crop.h)*mask.height/photo.naturalHeight};
  }
  function stroke(event) {
    if (!drawing) return;
    const p = point(event), ctx = mask.getContext('2d'), radius = number('brush-size')/2;
    ctx.save(); ctx.globalCompositeOperation = $('brush-mode').value === 'erase' ? 'destination-out' : 'source-over';
    ctx.fillStyle = ctx.strokeStyle = '#fff'; ctx.lineWidth = radius*2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(lastPoint.x,lastPoint.y); ctx.lineTo(p.x,p.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x,p.y,radius,0,Math.PI*2); ctx.fill(); ctx.restore();
    lastPoint = p; effective = null; drawEditor();
  }
  $('mask-canvas').addEventListener('pointerdown', event => {
    if (!mask || event.button !== 0) return;
    history.push(mask.getContext('2d').getImageData(0,0,mask.width,mask.height)); if(history.length>10) history.shift();
    $('undo-mask').disabled = false; drawing = true; lastPoint = point(event);
    $('mask-canvas').setPointerCapture(event.pointerId); stroke(event);
  });
  $('mask-canvas').addEventListener('pointermove', stroke);
  function finish() {if(drawing){drawing=false; redraw();}}
  $('mask-canvas').addEventListener('pointerup', finish); $('mask-canvas').addEventListener('pointercancel', finish);
  $('mask-editor').addEventListener('close', finish);
  $('undo-mask').onclick = () => {if(history.length){mask.getContext('2d').putImageData(history.pop(),0,0); effective=null; $('undo-mask').disabled=!history.length; redraw();}};
  $('reset-mask').onclick = () => {if(initial){mask.getContext('2d').putImageData(initial,0,0); history=[]; $('undo-mask').disabled=true; effective=null; redraw();}};
  $('edit-mask').onclick = () => {$('background-compare').checked=false; $('mask-editor').showModal(); drawEditor();};
  $('close-editor').onclick = () => {$('mask-editor').close(); render();};
  $('editor-zoom').onchange = drawEditor;
  $('remove-background').onclick = separate;
  $('background-mode').onchange = () => {$('background-options').hidden=$('background-mode').value==='original'; redraw();};
  $('background-color').addEventListener('input', redraw);
  $('background-compare').addEventListener('change', redraw);
  $('edge-cleanup').addEventListener('change', redraw);
  for(const id of ['edge-shift','edge-feather']) $(id).addEventListener('input', () => {updateMask(); redraw();});
  document.querySelectorAll('[data-color]').forEach(button => button.onclick = () => {$('background-color').value=button.dataset.color; redraw();});
  window.Background = {composite, reset};
})();
