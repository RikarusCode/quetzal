import {openSaves,readSave,writeSave} from './saves.mjs';
import {setupControls} from './controls.mjs';
const $=id=>document.getElementById(id),TARGET='e9fc9cf506ad11db7642e7d65774e2bb0e5f174eb9aceda725cd961ab9aee070';
const db=await openSaves(),worker=new Worker('./emulator-worker.mjs',{type:'module'});
const ctx=$('screen').getContext('2d');let key,loaded=false,audioCtx,nextAudio=0,saveChain=Promise.resolve();
setupControls({screen:$('screen'),send:message=>worker.postMessage(message),isLoaded:()=>loaded});
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
$('slot').value=new URL(location.href).searchParams.get('slot')==='B'?'B':'A';
$('slot').onchange=()=>{$('player-label').textContent=`TRAINER ${$('slot').value}`;};
$('slot').onchange();
function playAudio(pcm){
  if(!audioCtx || audioCtx.state!=='running'||!pcm.length)return;
  if(nextAudio>audioCtx.currentTime+.25)return;
  const buffer=audioCtx.createBuffer(2,pcm.length/2,32768);
  for(let ch=0;ch<2;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]=pcm[i*2+ch]/32768;}
  const source=audioCtx.createBufferSource();source.buffer=buffer;source.connect(audioCtx.destination);
  nextAudio=Math.max(nextAudio,audioCtx.currentTime+.025);source.start(nextAudio);nextAudio+=buffer.duration;
}
worker.onmessage=({data:m})=>{
  if(m.type==='frame'){ctx.putImageData(new ImageData(m.rgba,240,160),0,0);playAudio(m.audio);}
  if(m.type==='ready'){
    loaded=true;for(const id of ['sound','export','host','join'])$(id).disabled=false;
    $('empty-screen').hidden=true;
    $('status').textContent=`Playing · Trainer ${$('slot').value}${m.network?'':' · Wireless unavailable'}`;
  }
  if(m.type==='save'){
    saveChain=saveChain.then(()=>writeSave(db,key,m.bytes)).then(()=>{$('save-status').textContent=`Local backup updated ${new Date().toLocaleTimeString()}. Use the in-game Save menu to record new progress.`;})
      .catch(e=>{$('save-status').textContent=`Backup failed: ${e.message}. Export your save.`;});
  }
  if(m.type==='export'){
    const url=URL.createObjectURL(new Blob([m.bytes]));const a=document.createElement('a');a.href=url;a.download=`quetzal-${$('slot').value}.srm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(m.type==='link'){
    $('link-status').textContent=m.connected?'Transport connected. Now join through the in-game multiplayer menu.':m.reason;
    $('leave').disabled=!m.connected;
  }
  if(m.type==='stats'){$('stats').textContent=JSON.stringify(m,null,2);window.harnessStats=m;}
  if(m.type==='log')$('log').textContent=($('log').textContent+'\n'+m.text).slice(-10000);
  if(m.type==='error')$('status').textContent='Error: '+m.message;
};
worker.onerror=e=>{$('status').textContent='Worker error: '+e.message;};
async function loadRom(rom){
  try{
    $('status').textContent='Checking ROM…';
    if(await hash(rom)!==TARGET)throw Error('This harness requires the supplied Quetzal Alpha 8v4 patched ROM.');
    key=`${TARGET}:${$('slot').value}`;const record=await readSave(db,key);
    if(record && await hash(record.bytes)!==record.digest)throw Error('Local save checksum mismatch. Import a known good backup.');
    $('rom').disabled=true;$('slot').disabled=true;$('import').disabled=true;
    worker.postMessage({type:'load',rom,save:record?.bytes},[rom]);
    $('status').textContent=record?'Loading saved trainer…':'Starting a new trainer…';
  }catch(e){$('status').textContent=e.message;}
}
$('rom').onchange=async()=>{const file=$('rom').files[0];if(file)await loadRom(await file.arrayBuffer());};
if(new URL(location.href).searchParams.get('fixture')==='local'){
  const response=await fetch('/__test/rom');
  if(response.ok)await loadRom(await response.arrayBuffer());
  else $('status').textContent='Local test fixture is disabled. Select a ROM.';
}
$('sound').onclick=async()=>{
  try{if(!audioCtx){audioCtx=new AudioContext();await audioCtx.resume();}
    else if(audioCtx.state==='running')await audioCtx.suspend();else {nextAudio=0;await audioCtx.resume();}
    $('sound').textContent=audioCtx.state==='running'?'Mute sound':'Enable sound';
  }catch(e){$('status').textContent='Audio unavailable: '+e.message;}
};
$('export').onclick=()=>worker.postMessage({type:'export'});
$('import').onchange=async()=>{
  try{const file=$('import').files[0];if(!file)return;const bytes=new Uint8Array(await file.arrayBuffer());
    if(bytes.length!==131072)throw Error('Expected a 128 KiB cartridge save (.srm/.sav), not an emulator snapshot.');
    await writeSave(db,`${TARGET}:${$('slot').value}`,bytes);$('save-status').textContent='Save imported. Select the ROM to load it.';
  }catch(e){$('save-status').textContent=e.message;}
};
for(const [id,player]of [['host',0],['join',1]])$(id).onclick=()=>{
  const room=$('room').value.trim();if(!/^[a-zA-Z0-9_-]{1,32}$/.test(room)){ $('link-status').textContent='Use 1–32 letters, numbers, underscores or hyphens.';return;}
  worker.postMessage({type:'link',room,id:player});$('link-status').textContent='Waiting for the other player…';$('leave').disabled=false;
};
$('leave').onclick=()=>worker.postMessage({type:'unlink'});
