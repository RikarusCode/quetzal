import {openSaves,readSave,writeSave} from './saves.mjs';
import {setupControls} from './controls.mjs';
import {ROM_SHA256 as TARGET,newRoomCode,relaySocketURL} from './relay-protocol.mjs';
import {downloadGame} from './game-content.mjs';
const $=id=>document.getElementById(id);
const db=await openSaves(),worker=new Worker('./emulator-worker.mjs',{type:'module'});
const ctx=$('screen').getContext('2d');let key,loaded=false,audioCtx,nextAudio=0,saveChain=Promise.resolve(),linkState='idle',lastFrame=0,stalled=false,failed=false;
setupControls({screen:$('screen'),send:message=>worker.postMessage(message),isLoaded:()=>loaded});
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
$('slot').value=new URL(location.href).searchParams.get('slot')==='B'?'B':'A';
$('slot').onchange=()=>{$('player-label').textContent=`TRAINER ${$('slot').value}`;};
$('slot').onchange();
$('room').value=newRoomCode();
$('relay-url').value=['127.0.0.1','localhost'].includes(location.hostname)&&location.port==='4173'?'ws://127.0.0.1:8787/relay':`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/relay`;
if(new URL(location.href).searchParams.get('transport')==='local')$('transport').value='local';
$('new-room').onclick=()=>{$('room').value=newRoomCode();};
$('copy-room').onclick=async()=>{try{await navigator.clipboard.writeText($('room').value);$('room-feedback').textContent='Room code copied. Share it with the other player.';}catch{$('room').select();$('room-feedback').textContent='Select and copy the room code.';}};
$('transport').onchange=()=>{const local=$('transport').value==='local';for(const id of ['relay-url','delay','jitter'])$(id).disabled=local;};
$('transport').onchange();
function showLink(state,reason){
  linkState=state;$('link-status').textContent=state==='connected'?'Transport connected. Now join through the in-game multiplayer menu.':reason;
  $('host').disabled=$('join').disabled=!loaded||failed||state!=='idle';
  $('room').readOnly=state!=='idle';
  for(const id of ['new-room','transport','relay-url','delay','jitter'])$(id).disabled=state!=='idle';
  if(state==='idle')$('transport').onchange();$('leave').disabled=state==='idle';
  $('leave').textContent=['hosting','searching','starting','connecting'].includes(state)?'Cancel connection':'Disconnect';
}
function showError(message){
  failed=true;$('status').textContent='Emulator stopped: '+message+' · Reload to resume your last in-game save.';
  showLink('idle','Connection unavailable while the emulator is stopped.');
}
function playAudio(pcm){
  if(!audioCtx || audioCtx.state!=='running'||!pcm.length)return;
  if(nextAudio>audioCtx.currentTime+.25)return;
  const buffer=audioCtx.createBuffer(2,pcm.length/2,32768);
  for(let ch=0;ch<2;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]=pcm[i*2+ch]/32768;}
  const source=audioCtx.createBufferSource();source.buffer=buffer;source.connect(audioCtx.destination);
  nextAudio=Math.max(nextAudio,audioCtx.currentTime+.025);source.start(nextAudio);nextAudio+=buffer.duration;
}
worker.onmessage=({data:m})=>{
  if(m.type==='frame'){
    lastFrame=performance.now();if(stalled){stalled=false;$('status').textContent=`Playing · Trainer ${$('slot').value}`;}
    ctx.putImageData(new ImageData(m.rgba,240,160),0,0);playAudio(m.audio);
  }
  if(m.type==='ready'){
    loaded=true;lastFrame=performance.now();for(const id of ['sound','export'])$(id).disabled=false;
    showLink('idle',m.network?'Choose Host or Join to connect the two browser windows.':'Wireless unavailable in this emulator build.');
    if(!m.network)$('host').disabled=$('join').disabled=true;
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
  if(m.type==='link')showLink(m.state,m.reason);
  if(m.type==='stats'){$('stats').textContent=JSON.stringify(m,null,2);window.harnessStats=m;}
  if(m.type==='log')$('log').textContent=($('log').textContent+'\n'+m.text).slice(-10000);
  if(m.type==='error')showError(m.message);
};
worker.onerror=e=>showError(e.message);
setInterval(()=>{
  if(loaded&&!failed&&!document.hidden&&performance.now()-lastFrame>5000&&!stalled){
    stalled=true;$('status').textContent='Emulator is not producing frames. Check diagnostics; reload to resume your last in-game save if it does not recover.';
  }
},1000);
async function loadRom(rom){
  try{
    $('status').textContent='Checking ROM…';
    if(await hash(rom)!==TARGET)throw Error('This harness requires the supplied Quetzal Alpha 8v4 patched ROM.');
    key=`${TARGET}:${$('slot').value}`;const record=await readSave(db,key);
    if(record && await hash(record.bytes)!==record.digest)throw Error('Local save checksum mismatch. Import a known good backup.');
    $('play').disabled=true;$('slot').disabled=true;$('import').disabled=true;
    worker.postMessage({type:'load',rom,save:record?.bytes},[rom]);
    $('status').textContent=record?'Loading saved trainer…':'Starting a new trainer…';
  }catch(e){$('status').textContent=e.message;$('play').disabled=false;}
}
$('play').onclick=async()=>{
  $('play').disabled=true;$('slot').disabled=true;$('import').disabled=true;
  try{await loadRom(await downloadGame(message=>{$('status').textContent=message;}));}
  catch(error){$('status').textContent=error.message;$('play').disabled=false;}
  if(!$('play').disabled){$('slot').disabled=false;$('import').disabled=false;}
};
if(new URL(location.href).searchParams.get('fixture')==='local')await $('play').onclick();
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
    await writeSave(db,`${TARGET}:${$('slot').value}`,bytes);$('save-status').textContent='Save imported. Press Play to continue.';
  }catch(e){$('save-status').textContent=e.message;}
};
for(const [id,player]of [['host',0],['join',1]])$(id).onclick=()=>{
  const room=$('room').value.trim();if(!/^[a-zA-Z0-9_-]{1,32}$/.test(room)){ $('link-status').textContent='Use 1–32 letters, numbers, underscores or hyphens.';return;}
  const transport=$('transport').value,endpoint=$('relay-url').value.trim();
  try{if(transport==='websocket')relaySocketURL(endpoint,room);}catch(error){$('link-status').textContent=error.message;return;}
  showLink('starting',player===0?'Starting host…':'Starting search…');
  worker.postMessage({type:'link',room,id:player,transport,endpoint,delayMs:Number($('delay').value),jitterMs:Number($('jitter').value)});$('screen').focus();
};
$('leave').onclick=()=>{worker.postMessage({type:'unlink'});$('screen').focus();};
const player=$('game-player');
if(!document.fullscreenEnabled){$('fullscreen').disabled=true;$('fullscreen').textContent='Fullscreen unavailable';}
$('fullscreen').onclick=async()=>{
  try{if(document.fullscreenElement===player)await document.exitFullscreen();else await player.requestFullscreen();}
  catch(error){$('status').textContent='Fullscreen unavailable: '+error.message;}
};
document.addEventListener('fullscreenchange',()=>{
  const active=document.fullscreenElement===player;$('fullscreen').textContent=active?'Exit fullscreen ⛶':'Fullscreen ⛶';
  $('fullscreen').setAttribute('aria-pressed',String(active));if(loaded)$('screen').focus();
});
