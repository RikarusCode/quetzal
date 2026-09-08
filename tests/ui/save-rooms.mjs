// Run with PLAYWRIGHT_MODULE pointing to an installed playwright package.
// Uses a fresh browser context and synthetic save bytes; never touches personal saves.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base=process.env.UI_TEST_URL??'http://127.0.0.1:8787';
const browser=await chromium.launch({headless:true,channel:'msedge'});
const context=await browser.newContext({viewport:{width:1440,height:1050}}),errors=[];
context.setDefaultTimeout(15000);
context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
const page=await context.newPage();
const waitText=(p,id,text)=>p.locator(id).filter({hasText:text}).waitFor();
const openSlots=p=>p.locator('#edit-slots').click();
async function addSlot(p,name){await p.locator('#new-slot-name').fill(name);await p.locator('#add-slot-form button').click();await waitText(p,'#slots-status','Save slot added.');}
async function play(p){await p.locator('#play').click();await p.locator('#host').waitFor();await p.waitForFunction(()=>!document.querySelector('#host').disabled,{},{timeout:30000});}
try{
  console.log('UI: opening fresh browser');await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('#slot option').waitFor({state:'attached'});
  assert.equal(await page.locator('#slot option').count(),1);assert.equal(await page.locator('#room').inputValue(),'');
  await openSlots(page);await addSlot(page,'Weekend');
  await page.locator('.slot-row').last().locator('input').fill('Friends run');await page.locator('.slot-row').last().getByRole('button',{name:'Rename'}).click();
  await waitText(page,'#slots-status','Slot renamed');
  await mkdir('.local/ui',{recursive:true});await page.screenshot({path:'.local/ui/save-slots.png'});
  await page.locator('#done-slots').click();const chosen=await page.locator('#slot').inputValue();
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(value=>document.querySelector('#slot').value===value,chosen);
  assert.equal(await page.locator('#slot option:checked').textContent(),'Friends run');
  const bytes=Buffer.alloc(131072,255);bytes[0]=0x33;
  await page.getByText('Import save',{exact:true}).click();await page.locator('#import').setInputFiles({name:'test.srm',mimeType:'application/octet-stream',buffer:bytes});
  await waitText(page,'#save-status','Save imported');
  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;
  assert.deepEqual(await readFile(await download.path()),bytes);assert.match(download.suggestedFilename(),/Friends_run/);
  await openSlots(page);await addSlot(page,'Temporary');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('.slot-row').last().getByRole('button',{name:'Remove'}).click();assert.equal(await page.locator('.slot-row').count(),3);
  page.once('dialog',dialog=>{assert.match(dialog.message(),/cannot be undone/);return dialog.accept();});
  await page.locator('.slot-row').last().getByRole('button',{name:'Remove'}).click();await waitText(page,'#slots-status','Slot removed');assert.equal(await page.locator('.slot-row').count(),2);
  await page.locator('#done-slots').click();await page.locator('#slot').selectOption(chosen);await play(page);
  await page.locator('#fullscreen').click();await page.waitForFunction(()=>document.fullscreenElement?.id==='game-player');
  assert.equal(await page.locator('.player-toolbar').isVisible(),false);assert.equal(await page.locator('.player-heading').isVisible(),false);
  assert.equal(await page.locator('.control-strip').isVisible(),false);
  const fullscreen=await page.locator('#screen').evaluate(canvas=>{const r=canvas.getBoundingClientRect();return {width:r.width,height:r.height,vw:innerWidth,vh:innerHeight};});
  assert.ok(Math.abs(fullscreen.width/fullscreen.height-1.5)<.01,'Fullscreen preserves the game aspect ratio');
  assert.ok(Math.abs(fullscreen.width-fullscreen.vw)<2||Math.abs(fullscreen.height-fullscreen.vh)<2,'Fullscreen game fills the limiting screen dimension');
  await page.screenshot({path:'.local/ui/fullscreen.png'});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.fullscreenElement);
  await page.locator('#settings').click();await page.locator('#settings-dialog').waitFor({state:'visible'});await page.locator('#done-settings').click();
  console.log('UI: slots and save import/export passed');
  const second=await context.newPage();await second.goto(base,{waitUntil:'domcontentloaded'});await second.locator('#slot option').first().waitFor({state:'attached'});
  await second.locator('#slot').selectOption(chosen);await second.locator('#play').click();await waitText(second,'#status','open in another tab');
  // The active slot cannot be deleted from another tab, even if that tab isn't playing.
  await openSlots(second);const activeRow=second.locator('.slot-row').filter({has:second.locator('input')}).nth(1);
  second.once('dialog',dialog=>dialog.accept());await activeRow.getByRole('button',{name:'Remove'}).click();await waitText(second,'#slots-status','open in another tab');
  await second.locator('#done-slots').click();await second.locator('#slot').selectOption({label:'My trainer'});await play(second);
  await openSlots(page);await addSlot(page,'Player three');await addSlot(page,'Player four');await page.locator('#done-slots').click();
  const pages=[page,second];
  console.log('UI: cross-tab save locks passed');
  for(const label of ['Player three','Player four']){const p=await context.newPage();await p.goto(base,{waitUntil:'domcontentloaded'});await p.locator('#slot option').first().waitFor({state:'attached'});await p.locator('#slot').selectOption({label});await play(p);pages.push(p);}
  await page.locator('#host').click();await waitText(page,'#player-count','1 / 4');const code=await page.locator('#room').inputValue();assert.match(code,/^[a-f0-9]{32}$/);
  await second.locator('#show-join').click();await second.locator('#join-code').fill('bad');await second.locator('#join').click();await waitText(second,'#link-status','complete 32-character');
  await second.locator('#join-code').fill('0'.repeat(32));await second.locator('#join').click();await waitText(second,'#link-status','Room not found');
  for(const p of pages.slice(1)){
    if(await p.locator('#join-form').isHidden())await p.locator('#show-join').click();
    await p.locator('#join-code').fill(code);await p.locator('#join').click();
  }
  for(const p of pages)await waitText(p,'#player-count','4 / 4');
  assert.equal(await page.locator('#room-players .present').count(),4);
  await page.screenshot({path:'.local/ui/four-player-room.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.local/ui/rooms-mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile page has no horizontal overflow');
  await pages[3].locator('#leave').click();for(const p of pages.slice(0,3))await waitText(p,'#player-count','3 / 4');
  await waitText(page,'#link-status','A player left');
  await pages[3].locator('#join-code').fill(code);await pages[3].locator('#join').click();for(const p of pages)await waitText(p,'#player-count','4 / 4');
  await page.locator('#leave').click();for(const p of pages.slice(1))await waitText(p,'#link-status','host left');
  assert.deepEqual(errors,[]);console.log('Browser UI passed: slots, persistence, import/export, removal warning, cross-tab locks, four-player room counts, errors, guest rejoin, host closure, mobile layout. No gameplay performed.');
}finally{await browser.close();}
