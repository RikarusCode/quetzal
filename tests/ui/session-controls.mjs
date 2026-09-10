// Real browser/core/relay lifecycle checks in isolated profiles; no trainer gameplay.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base=process.env.UI_TEST_URL??'http://127.0.0.1:8787';
const browser=await chromium.launch({headless:true,channel:'msedge'});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];
context.setDefaultTimeout(15000);
context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
// Observe real audio nodes without replacing their behavior.
await context.addInitScript(()=>{
  window.testAudio=[];
  const createGain=AudioContext.prototype.createGain;
  AudioContext.prototype.createGain=function(){const gain=createGain.call(this);window.testAudio.push({context:this,gain});return gain;};
});
const waitText=(p,id,text)=>p.locator(id).filter({hasText:text}).waitFor();
async function open(p){await p.goto(base,{waitUntil:'domcontentloaded'});await p.locator('#slot option').first().waitFor({state:'attached'});}
async function play(p){await p.locator('#play').click();await p.waitForFunction(()=>!document.querySelector('#host').disabled,null,{timeout:45000});}
async function end(p){await p.locator('#end-session').click();await p.locator('#confirm-end').click();await p.waitForFunction(()=>!document.querySelector('#play').disabled);}
async function idle(p){
  assert.equal(await p.locator('#end-session').isHidden(),true);
  assert.equal(await p.locator('#empty-screen').isVisible(),true);
  for(const id of ['host','show-join','join','sound'])assert.equal(await p.locator('#'+id).isDisabled(),true,`${id} disabled before Play`);
}
try{
  const host=await context.newPage();await open(host);await idle(host);
  // A restored form's disabled flags must always be reconciled with session state.
  await host.evaluate(()=>{for(const id of ['host','show-join','join'])document.getElementById(id).disabled=false;dispatchEvent(new Event('pageshow'));});
  await idle(host);
  await host.locator('#room-help-button').hover();await host.locator('#room-help-text').waitFor({state:'visible'});
  assert.match(await host.locator('#room-help-text').textContent(),/host should then enable Multiplayer/);
  await host.locator('#room-help-button').focus();await host.keyboard.press('Escape');assert.equal(await host.locator('#room-help-text').isVisible(),false);
  await play(host);
  // Play alone starts actual audio at the fresh-profile default, before any
  // interaction with the volume popover or game canvas.
  await host.waitForFunction(()=>window.testAudio[0]?.context.state==='running'&&window.harnessStats?.audio?.renderedSamples>1000);
  assert.equal(await host.evaluate(()=>window.testAudio[0].gain.gain.value),.5);
  assert.equal(await host.locator('#volume').inputValue(),'50');
  assert.equal(await host.locator('#mute').getAttribute('aria-pressed'),'false');
  const locked=await context.newPage();await open(locked);await locked.locator('#play').click();
  await waitText(locked,'#status','open in another tab');
  await locked.waitForFunction(()=>window.testAudio[0]?.context.state==='closed');await locked.close();
  for(const id of ['host','show-join','join'])assert.equal(await host.locator('#'+id).isEnabled(),true);
  await host.locator('#sound').click();await host.locator('#volume-popover').waitFor({state:'visible'});
  const audibleIcon=await host.locator('#volume-symbol').getAttribute('d');
  const iconColor=await host.locator('#mute').evaluate(el=>getComputedStyle(el).color);
  // A suspended device must resume from the slider interaction itself.
  await host.evaluate(()=>window.testAudio[0].context.suspend());
  await host.locator('#volume').fill('25');
  await host.waitForFunction(()=>window.testAudio[0].context.state==='running'&&Math.abs(window.testAudio[0]?.gain.gain.value-.25)<.001);
  assert.equal(await host.evaluate(()=>document.activeElement.id),'volume');
  assert.equal(await host.locator('#volume-value').textContent(),'25%');
  await host.locator('#mute').click();assert.equal(await host.locator('#volume').inputValue(),'0');
  await host.waitForFunction(()=>window.testAudio[0].gain.gain.value<.001);
  assert.notEqual(await host.locator('#volume-symbol').getAttribute('d'),audibleIcon);
  assert.equal(await host.locator('#mute').getAttribute('aria-label'),'Unmute');
  assert.equal(await host.locator('#mute').evaluate(el=>getComputedStyle(el).color),iconColor);
  await host.locator('#mute').click();assert.equal(await host.locator('#volume').inputValue(),'25');
  assert.equal(await host.locator('#volume-symbol').getAttribute('d'),audibleIcon);
  assert.equal(await host.locator('#mute').getAttribute('aria-label'),'Mute');
  await mkdir('.local/ui',{recursive:true});await host.screenshot({path:'.local/ui/volume.png'});
  await host.keyboard.press('Escape');assert.equal(await host.locator('#volume-popover').isHidden(),true);
  await host.locator('#end-session').click();assert.match(await host.locator('#end-warning').textContent(),/Save in Quetzal.*Saved locally/);
  await host.screenshot({path:'.local/ui/end-session.png'});
  await host.locator('#cancel-end').click();assert.equal(await host.locator('#play').isDisabled(),true);
  const guestContext=await browser.newContext();const guest=await guestContext.newPage();
  guest.on('pageerror',error=>errors.push(error.message));await open(guest);await play(guest);
  await host.locator('#host').click();await waitText(host,'#player-count','1 / 4');
  const code=await host.locator('#room').inputValue();
  await guest.locator('#show-join').click();await guest.locator('#join-code').fill(code);await guest.locator('#join').click();
  await waitText(host,'#player-count','2 / 4');await waitText(guest,'#player-count','2 / 4');
  let warnings=0;
  const dismissed=new Promise(resolve=>host.once('dialog',async dialog=>{assert.equal(dialog.type(),'beforeunload');warnings++;await dialog.dismiss();resolve();}));
  await host.evaluate(()=>setTimeout(()=>location.reload(),0));await dismissed;
  assert.equal(warnings,1);assert.equal(await host.locator('#play').isDisabled(),true);
  await waitText(host,'#player-count','2 / 4');
  await end(guest);await idle(guest);await waitText(host,'#player-count','1 / 4');
  await play(guest);await guest.locator('#show-join').click();await guest.locator('#join-code').fill(code);await guest.locator('#join').click();
  await waitText(host,'#player-count','2 / 4');
  await end(host);await idle(host);await waitText(guest,'#link-status','host left');
  assert.equal(await guest.locator('#host').isEnabled(),true);
  assert.equal(await host.evaluate(()=>window.testAudio[0].context.state),'closed');
  assert.equal(await host.evaluate(()=>window.harnessStats),undefined);
  // The old active slot is available to a second tab immediately after shutdown.
  const another=await context.newPage();await open(another);await play(another);await end(another);
  await play(host);await host.locator('#sound').click();assert.equal(await host.locator('#volume').inputValue(),'25');
  assert.equal(await host.evaluate(()=>window.testAudio.length),2);
  await host.locator('#host').click();await waitText(host,'#player-count','1 / 4');
  host.once('dialog',dialog=>{assert.equal(dialog.type(),'beforeunload');warnings++;return dialog.accept();});
  await host.reload({waitUntil:'domcontentloaded'});await host.locator('#slot option').first().waitFor({state:'attached'});await idle(host);
  assert.equal(warnings,2);assert.equal(await host.locator('#volume').inputValue(),'25');
  // Idle reloads should not prompt at all.
  const unexpected=dialog=>{errors.push('Unexpected idle navigation warning');return dialog.accept();};
  host.on('dialog',unexpected);await host.reload({waitUntil:'domcontentloaded'});await host.locator('#slot option').first().waitFor({state:'attached'});await idle(host);host.off('dialog',unexpected);
  await play(host);await host.setViewportSize({width:390,height:844});
  await host.locator('#room-help-button').click();await host.locator('#room-help-text').waitFor({state:'visible'});
  await host.screenshot({path:'.local/ui/room-help-mobile.png',fullPage:true});
  assert.ok(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const tip=await host.locator('#room-help-text').boundingBox();assert.ok(tip.x>=0&&tip.x+tip.width<=390);
  await host.locator('#sound').click();const volume=await host.locator('#volume-popover').boundingBox();assert.ok(volume.x>=0&&volume.x+volume.width<=390);
  await end(host);await end(guest);
  // An explicitly saved mute preference is respected on the next page load.
  await play(host);await host.locator('#sound').click();await host.locator('#mute').click();await end(host);
  await open(host);await play(host);
  await host.waitForFunction(()=>window.testAudio[0]?.context.state==='running');
  assert.equal(await host.evaluate(()=>window.testAudio[0].gain.gain.value),0);
  assert.equal(await host.locator('#mute').getAttribute('aria-pressed'),'true');
  await end(host);
  assert.deepEqual(errors,[]);
  console.log('Passed: automatic 50% audio, focus-independent slider resume, speaker/mute icons, gain and mute persistence, failed-start cleanup, tooltip, session restart/shutdown, save locks, reload guards, room controls and mobile layout. No gameplay performed.');
}finally{await browser.close();}
