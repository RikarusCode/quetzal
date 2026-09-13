// Browser input integration with synthetic Gamepad API snapshots, no ROM or saves.
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,channel:'msedge'});
const context=await browser.newContext({viewport:{width:1200,height:1000}}),errors=[];
const base=process.env.UI_TEST_URL??'http://127.0.0.1:4173';
await context.addInitScript(()=>{
  window.testPads=[];
  Object.defineProperty(navigator,'getGamepads',{value:()=>{if(localStorage.getItem('test.controllerDenied'))throw new DOMException('Denied','SecurityError');return window.testPads;}});
});
await context.route('**/main.mjs',route=>route.fulfill({contentType:'text/javascript',body:`
  import {setupControls} from './controls.mjs';
  window.testMessages=[];window.testMask=0;window.testLoaded=false;
  setupControls({screen:document.getElementById('screen'),isLoaded:()=>window.testLoaded,send:message=>{window.testMessages.push(message);window.testMask=message.mask??0;}});
  document.getElementById('play').disabled=false;
  document.getElementById('play').onclick=()=>{window.testLoaded=true;document.getElementById('screen').focus();};
  window.controlsReady=true;
`}));
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const tick=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const mask=async expected=>{await page.waitForFunction(n=>window.testMask===n,expected);};
async function connect(index,id='Xbox Wireless Controller',mapping='standard'){
  await page.evaluate(({index,id,mapping})=>{window.testPads[index]={index,id,mapping,connected:true,buttons:Array.from({length:17},()=>({pressed:false,value:0})),axes:[0,0,0,0]};dispatchEvent(new Event('gamepadconnected'));},{index,id,mapping});await tick();
}
async function button(index,pressed,pad=0){await page.evaluate(({index,pressed,pad})=>{window.testPads[pad].buttons[index]={pressed,value:pressed?1:0};},{index,pressed,pad});await tick();}
async function settings(){await page.locator('#settings').click();await page.locator('#controller-tab').click();}
try{
  await page.goto(base);await page.waitForFunction(()=>window.controlsReady);
  await settings();assert.equal(await page.locator('#controller-device').isDisabled(),true);
  await connect(0);assert.equal(await page.locator('#controller-device').isEnabled(),true);
  assert.equal(await page.locator('[data-gamepad-action=a]').textContent(),'Bottom face');
  await page.locator('#done-settings').click();await page.locator('#play').click();await tick();
  await button(0,true);await mask(256);
  await page.keyboard.down('KeyW');await mask(272);
  await button(0,false);await mask(16);
  await button(0,true);await page.keyboard.up('KeyW');await mask(256);
  await button(0,false);await mask(0);
  const count=await page.evaluate(()=>window.testMessages.length);await tick();await tick();
  assert.equal(await page.evaluate(()=>window.testMessages.length),count,'Idle polls send no redundant messages');
  await page.evaluate(()=>{window.testPads[0].axes[0]=.2;});await tick();await mask(0);
  await page.evaluate(()=>{window.testPads[0].axes[0]=.8;});await tick();await mask(128);
  await settings();await mask(0);
  await page.locator('#done-settings').click();await tick();await mask(0);
  await page.evaluate(()=>{window.testPads[0].axes[0]=0;});await tick();
  await button(0,true);await mask(256);
  await page.locator('#end-dialog').evaluate(el=>el.showModal());await tick();await mask(0);
  await page.locator('#end-dialog').evaluate(el=>el.close());await page.locator('#screen').focus();await tick();await mask(0);
  await button(0,false);await button(0,true);await mask(256);
  await page.evaluate(()=>dispatchEvent(new Event('blur')));await mask(0);await tick();await mask(0);
  await button(0,false);await button(0,true);await mask(256);
  await settings();
  // An already-held input must not be captured until it is released and pressed again.
  await page.locator('[data-gamepad-action=b]').click();await tick();
  assert.equal(await page.locator('[data-gamepad-action=b]').textContent(),'Press input…');
  await button(0,false);await button(0,true);
  assert.equal(await page.locator('[data-gamepad-action=b]').textContent(),'Bottom face');
  assert.equal(await page.locator('[data-gamepad-action=a]').textContent(),'Right face');
  await button(0,false);
  await page.locator('[data-gamepad-action=l]').click();await page.keyboard.press('Escape');
  assert.equal(await page.locator('#settings-dialog').isVisible(),true);
  assert.equal(await page.locator('[data-gamepad-action=l]').textContent(),'L shoulder');
  await page.locator('[data-gamepad-action=l]').click();await page.evaluate(()=>{window.testPads[0].axes[2]=-.9;});await tick();
  assert.equal(await page.locator('[data-gamepad-action=l]').textContent(),'Axis 3 -');
  await page.evaluate(()=>{window.testPads[0].axes[2]=0;});
  await page.locator('#controller-deadzone').fill('45');
  const downloading=page.waitForEvent('download');await page.locator('#export-controller').click();const download=await downloading;
  const exported=await readFile(await download.path(),'utf8');assert.equal(JSON.parse(exported).profile.deadzone,.45);
  await page.locator('#reset-controller').click();assert.equal(await page.locator('[data-gamepad-action=a]').textContent(),'Bottom face');
  await page.locator('#import-controller').setInputFiles({name:'controller.json',mimeType:'application/json',buffer:Buffer.from(exported)});
  await page.waitForFunction(()=>document.getElementById('controller-status').textContent.includes('imported'));
  assert.equal(await page.locator('[data-gamepad-action=a]').textContent(),'Right face');
  await page.locator('#import-controller').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"profile":{}}')});
  await page.waitForFunction(()=>document.getElementById('controller-status').textContent.includes('Invalid'));
  assert.equal(await page.locator('[data-gamepad-action=a]').textContent(),'Right face');
  await page.locator('#keyboard-tab').click();assert.equal(await page.locator('[data-action=a]').textContent(),'E');
  await page.locator('[data-action=a]').click();await page.keyboard.press('KeyV');assert.equal(await page.locator('[data-action=a]').textContent(),'V');
  await page.locator('#controller-tab').click();assert.equal(await page.locator('[data-gamepad-action=a]').textContent(),'Right face');
  await connect(1,'DualSense Wireless Controller');await page.locator('#controller-device').selectOption('1');
  await page.locator('#done-settings').click();await tick();await button(1,true,0);await mask(0);
  await button(1,true,1);await mask(256);
  await page.evaluate(()=>{window.testPads[1]=null;dispatchEvent(new Event('gamepaddisconnected'));});await tick();await mask(0);
  await button(1,false,0);await button(1,true,0);await mask(256);
  await page.evaluate(()=>{window.testPads=[];dispatchEvent(new Event('gamepaddisconnected'));});await tick();await mask(0);
  await page.keyboard.down('KeyV');await mask(256);await page.keyboard.up('KeyV');await mask(0);
  await settings();await connect(0,'Generic USB pad','');
  assert.equal(await page.locator('[data-gamepad-action=a]').textContent(),'Not set');
  await page.locator('[data-gamepad-action=a]').click();await button(2,true);assert.equal(await page.locator('[data-gamepad-action=a]').textContent(),'Button 3');await button(2,false);
  await connect(1,'Switch Pro Controller');await page.locator('#controller-device').selectOption('1');
  assert.equal(await page.locator('[data-gamepad-action=a]').textContent(),'Right face');
  await mkdir('.local/ui',{recursive:true});await page.screenshot({path:'.local/ui/controller-settings.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.local/ui/controller-settings-mobile.png',fullPage:true});
  assert.ok(await page.locator('#settings-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));
  await page.reload();await page.waitForFunction(()=>window.controlsReady);await settings();await connect(0);
  assert.equal(await page.locator('[data-gamepad-action=a]').textContent(),'Right face');
  assert.equal(await page.locator('#controller-deadzone').inputValue(),'45');
  await page.locator('#keyboard-tab').click();assert.equal(await page.locator('[data-action=a]').textContent(),'V');
  await page.evaluate(()=>localStorage.setItem('test.controllerDenied','1'));
  await page.reload();await page.waitForFunction(()=>window.controlsReady);await settings();
  assert.match(await page.locator('#controller-connection').textContent(),/unavailable/);
  await page.locator('#done-settings').click();await page.locator('#play').click();await page.keyboard.down('KeyV');await mask(256);await page.keyboard.up('KeyV');
  // Exercise the real page and emulator worker once, without progressing a trainer.
  await context.unroute('**/main.mjs');
  await context.addInitScript(()=>{
    window.testMask=0;
    const post=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(message,...rest){if(message.type==='buttons')window.testMask=message.mask;if(message.type==='release-buttons')window.testMask=0;return post.call(this,message,...rest);};
  });
  await page.evaluate(()=>{localStorage.removeItem('test.controllerDenied');localStorage.removeItem('quetzal.controllers.v1');});
  await page.reload();await page.locator('#slot option').first().waitFor({state:'attached'});await connect(0);
  await page.locator('#play').click();await page.waitForFunction(()=>!document.getElementById('host').disabled,null,{timeout:45000});
  await page.locator('#screen').click();await tick();
  await button(4,true);await mask(1024);await button(4,false);await mask(0);
  await page.waitForFunction(()=>window.harnessStats?.frames>30);
  await page.locator('#fullscreen').click();await page.waitForFunction(()=>!!document.fullscreenElement);await tick();
  await button(4,true);await mask(1024);await button(4,false);await mask(0);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.fullscreenElement);
  await page.locator('#end-session').click();await page.locator('#confirm-end').click();
  await page.waitForFunction(()=>!document.getElementById('play').disabled);
  assert.deepEqual(errors,[]);
  console.log('Passed: simulated controller discovery, defaults, mixed input, deadzones, remapping, focus/dialog safety, disconnects, device selection, persistence, import/export, mobile layout, API denial and delivery to the real emulator worker. Physical hardware remains a manual check.');
}finally{await browser.close();}
