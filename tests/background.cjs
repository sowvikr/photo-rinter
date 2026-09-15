const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true});
 try {
  const p=await b.newPage({viewport:{width:1200,height:1000}}), errors=[]; p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:8000');
  const fixtures=await p.evaluate(()=>{
   const c=document.createElement('canvas');c.width=350;c.height=450;const x=c.getContext('2d');
   x.fillStyle='#00ff00';x.fillRect(0,0,350,450);x.fillStyle='#aa6633';x.fillRect(100,50,150,350);
   // Pink-contaminated band with a known clean foreground estimate.
   x.fillStyle='#ee4488';x.fillRect(90,50,10,350);
   const source=c.toDataURL().split(',')[1];x.clearRect(0,0,350,450);x.fillStyle='#aa6633';x.fillRect(100,50,150,350);
   x.fillStyle='rgba(170,102,51,0.5)';x.fillRect(90,50,10,350);
   return {source,mask:c.toDataURL().split(',')[1]};
  });
  await p.route('**/detect',r=>r.fulfill({json:{faces:[]}}));
  await p.route('**/segment',r=>r.fulfill({contentType:'image/png',body:Buffer.from(fixtures.mask,'base64')}));
  await p.locator('#upload').setInputFiles({name:'person.png',mimeType:'image/png',buffer:Buffer.from(fixtures.source,'base64')});
  await p.waitForFunction(()=>!!document.getElementById('face-status').textContent);
  await p.locator('#background-mode').selectOption('color');await p.locator('#remove-background').click();
  await p.waitForFunction(()=>document.getElementById('background-status').textContent.startsWith('Background ready'));
  const pixels=()=>p.evaluate(()=>{const c=cropCanvas();const x=c.getContext('2d');return {bg:Array.from(x.getImageData(10,10,1,1).data),face:Array.from(x.getImageData(c.width/2,c.height/2,1,1).data)};});
  assert.deepEqual((await pixels()).bg,[255,255,255,255]); assert.deepEqual((await pixels()).face,[170,102,51,255]);
  const edge=()=>p.evaluate(()=>{const c=cropCanvas(254);return Array.from(c.getContext('2d').getImageData(94,200,1,1).data);});
  const clean=await edge();
  assert(Math.abs(clean[0]-212)<3 && Math.abs(clean[1]-178)<3 && Math.abs(clean[2]-153)<3, `Expected clean brown blended over white, got ${clean}`);
  await p.locator('#edge-cleanup').uncheck(); const dirty=await edge();
  assert(dirty[0]>clean[0]+20 && dirty[2]>clean[2]+20,'Regression: discarded foreground colors leave a pink fringe');
  await p.locator('#edge-cleanup').check();
  await p.locator('[data-color="#4389d0"]').click();assert.deepEqual((await pixels()).bg,[67,137,208,255]);
  await p.locator('#background-compare').check();assert.deepEqual((await pixels()).bg,[67,137,208,255]);
  await p.locator('#edit-mask').click();await p.locator('#brush-mode').selectOption('erase');
  const rect=await p.locator('#mask-canvas').boundingBox();await p.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2);
  assert.deepEqual((await pixels()).face,[67,137,208,255]);
  await p.locator('#undo-mask').click();assert.deepEqual((await pixels()).face,[170,102,51,255]);
  await p.locator('#editor-zoom').selectOption('3'); await p.locator('#close-editor').click();
  await p.evaluate(()=>preparePrint());assert.equal(await p.locator('.print-photo').count(),8);
  await p.locator('#background-mode').selectOption('original');assert.deepEqual((await pixels()).bg,[0,255,0,255]);
  await p.locator('#background-mode').selectOption('color');
  await p.route('**/segment',r=>r.fulfill({status:503,json:{error:'Test failure'}}));
  await p.locator('#remove-background').click();await p.waitForFunction(()=>document.getElementById('background-status').textContent==='Test failure');
  assert(await p.locator('#remove-background').isEnabled());
  await p.locator('#upload').setInputFiles({name:'new.png',mimeType:'image/png',buffer:Buffer.from(fixtures.source,'base64')});
  await p.waitForFunction(()=>document.getElementById('background-refine').hidden);
  assert.deepEqual((await pixels()).bg,[0,255,0,255]);
  assert.deepEqual(errors,[]);console.log('Background checks passed: color, original pixels, comparison/export, brush, undo, reset, failure recovery, new-photo reset.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
