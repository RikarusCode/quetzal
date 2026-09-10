import {openSaves,readSave,writeSave,lockSlot,slotKey} from './saves.mjs';
import {setupSaveSlots} from './save-slots-ui.mjs';
import {setupControls} from './controls.mjs';
import {setupVolume} from './volume.mjs';
import {ROM_SHA256 as TARGET,newRoomCode,relaySocketURL} from './relay-protocol.mjs';
import {downloadGame} from './game-content.mjs';
import {createPresenter} from './video.mjs';
const $=id=>document.getElementById(id);
for(const id of ['host','show-join','join','sound'])$(id).disabled=true;
const db=await openSaves().catch(error=>{$('status').textContent=error.message;$('play').disabled=true;throw error;});
const ctx=$('screen').getContext('2d');let worker,key,loaded=false,loading=false,ending=false,networkAvailable=false,unlockSave,stopAck,saveChain=Promise.resolve(),linkState='idle',lastFrame=0,stalled=false,failed=false;
setupControls({screen:$('screen'),send:message=>worker?.postMessage(message),isLoaded:()=>loaded&&!ending});
let audioStats=null;
const presenter=createPresenter(rgba=>ctx.putImageData(new ImageData(rgba,240,160),0,0));
const audio=setupVolume({isPlaying:()=>loaded&&!ending,send:(message,transfer=[])=>worker?.postMessage(message,transfer),onStats:stats=>{audioStats=stats;},onError:error=>{$('status').textContent='Audio unavailable: '+error.message;}});
function beforeUnload(event){if(loaded){event.preventDefault();event.returnValue='Save your game in Quetzal before leaving.';}}
function syncSessionControls(){
  const busy=loaded||loading||ending,canConnect=loaded&&networkAvailable&&!failed&&!ending&&linkState==='idle';
  $('play').disabled=busy;$('end-session').hidden=!loaded;$('end-session').disabled=ending;
  $('slot').disabled=$('import').disabled=busy;$('slot-hint').hidden=!loaded;
  $('sound').disabled=!loaded||ending;
  if(ending)$('export').disabled=true;
  for(const id of ['host','show-join','join'])$(id).disabled=!canConnect;
  $('join-code').disabled=busy&&!canConnect;
  $('leave').disabled=linkState==='idle'||ending;
}
window.addEventListener('pageshow',syncSessionControls);
syncSessionControls();
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const slots=await setupSaveSlots({db,game:TARGET,isPlaying:()=>loaded||loading||ending,onChange:slot=>{
  $('player-label').textContent=slot.name;
  if(!loaded)readSave(db,slotKey(TARGET,slot.id)).then(record=>{if($('slot').value===slot.id)$('export').disabled=!record;}).catch(e=>{$('save-status').textContent=e.message;});
}});
$('relay-url').value=['127.0.0.1','localhost'].includes(location.hostname)&&location.port==='4173'?'ws://127.0.0.1:8787/relay':`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/relay`;
if(new URL(location.href).searchParams.get('transport')==='local')$('transport').value='local';
$('copy-room').onclick=async()=>{try{await navigator.clipboard.writeText($('room').value);$('room-feedback').textContent='Code copied.';}catch{$('room').select();$('room-feedback').textContent='Select and copy the code.';}};
$('copy-invite').onclick=async()=>{
  const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('room',$('room').value);
  if($('transport').value==='local')url.searchParams.set('transport','local');
  try{await navigator.clipboard.writeText(url.href);$('room-feedback').textContent='Invite link copied.';}catch{$('room-feedback').textContent='Could not copy the invite. Use Copy code instead.';}
};
$('show-join').onclick=()=>{$('join-form').hidden=!$('join-form').hidden;if(!$('join-form').hidden)$('join-code').focus();};
const invitation=new URL(location.href).searchParams.get('room');
if(invitation){$('join-code').value=invitation;$('join-form').hidden=false;$('link-status').textContent='Start the game, then join.';}
$('transport').onchange=()=>{const local=$('transport').value==='local';for(const id of ['relay-url','delay','jitter'])$(id).disabled=local;};
$('transport').onchange();
function showLink(state,reason,details={}){
  linkState=state;$('link-status').textContent=reason||'Connected. Open Multiplayer in Quetzal.';
  syncSessionControls();
  for(const id of ['transport','relay-url','delay','jitter'])$(id).disabled=state!=='idle';
  if(state==='idle')$('transport').onchange();
  $('leave').hidden=state==='idle';$('leave').textContent=['starting','connecting'].includes(state)?'Cancel connection':details.id===0?'Close room':'Leave room';
  const active=['hosting','connected'].includes(state);$('active-room').hidden=!active;$('room-actions').hidden=active;
  if(active){
    $('room').value=details.room;$('room-role').textContent=details.id===0?'Hosting':`Player ${details.id+1}`;
    $('player-count').textContent=`${details.members.length} / 4 players`;
    $('room-players').replaceChildren(...Array.from({length:4},(_,id)=>{
      const li=document.createElement('li'),present=details.members.some(p=>p.id===id);li.className=present?'present':'empty';
      li.textContent=present?`${id===0?'Host':`Player ${id+1}`}${id===details.id?' · You':''}`:'Open space';return li;
    }));
  }else if(state==='idle'){$('room').value='';$('room-feedback').textContent='';}
}
function showError(message){
  failed=true;$('status').textContent='Emulator stopped: '+message+' · Reload to resume your last in-game save.';
  showLink('idle','Connection unavailable while the emulator is stopped.');
}
function startWorker(){
const instance=worker=new Worker('./emulator-worker.mjs',{type:'module'});
instance.onmessage=({data:m})=>{
  if(instance!==worker)return;
  if(m.type==='stopped'){stopAck?.();return;}
  if(m.type==='frame'){
    lastFrame=performance.now();if(stalled){stalled=false;$('status').textContent='Running';}
    presenter.submit(m.rgba,buffer=>{if(instance===worker)instance.postMessage({type:'video-buffer',buffer},[buffer]);});
  }
  if(m.type==='ready'){
    loaded=true;loading=false;failed=false;networkAvailable=!!m.network;lastFrame=performance.now();$('export').disabled=false;
    audio.connect();
    window.addEventListener('beforeunload',beforeUnload);
    showLink('idle',m.network?'Solo':'Multiplayer unavailable.');
    $('empty-screen').hidden=true;
    $('status').textContent='Running';
  }
  if(m.type==='save'){
    const saveKey=key;
    saveChain=saveChain.then(()=>writeSave(db,saveKey,m.bytes)).then(()=>{$('save-status').textContent=`Saved locally · ${new Date().toLocaleTimeString()}`;})
      .catch(e=>{$('save-status').textContent=`Backup failed: ${e.message}. Export your save.`;});
  }
  if(m.type==='export'){
    downloadSave(m.bytes);
  }
  if(m.type==='link')showLink(m.state,m.reason,m);
  if(m.type==='stats'){const stats={...m,video:presenter.stats(),audio:audioStats};$('stats').textContent=JSON.stringify(stats,null,2);window.harnessStats=stats;}
  if(m.type==='log')$('log').textContent=($('log').textContent+'\n'+m.text).slice(-10000);
  if(m.type==='error'){if(loaded)showError(m.message);else failStart(m.message);}
};
instance.onerror=e=>{if(instance!==worker)return;if(loaded)showError(e.message);else failStart(e.message);};
return instance;
}
function failStart(message){
  const old=worker;worker=null;old?.terminate();loading=false;failed=false;networkAvailable=false;
  audio.stop().catch(()=>{});
  unlockSave?.();unlockSave=null;key=null;showLink('idle','Start the game to connect.');$('status').textContent=message;
}
setInterval(()=>{
  if(loaded&&!failed&&!document.hidden&&performance.now()-lastFrame>5000&&!stalled){
    stalled=true;$('status').textContent='Emulator is not producing frames. Check diagnostics; reload to resume your last in-game save if it does not recover.';
  }
},1000);
async function loadRom(rom){
    // ROM integrity was checked in the loader worker before it entered the cache.
    const record=await readSave(db,key);
    if(record && await hash(record.bytes)!==record.digest)throw Error('Local save checksum mismatch. Import a known good backup.');
    $('play').disabled=true;$('slot').disabled=true;$('import').disabled=true;
    worker.postMessage({type:'load',rom,save:record?.bytes},[rom]);
    $('status').textContent=record?'Loading saved trainer…':'Starting a new trainer…';
}
$('play').onclick=async()=>{
  if(loaded||loading||ending)return;
  loading=true;failed=false;networkAvailable=false;syncSessionControls();showLink('idle','Starting game…');
  audio.start();
  try{
    const slot=slots.current();unlockSave=await lockSlot(TARGET,slot.id);key=slotKey(TARGET,slot.id);
    presenter.clear();startWorker();
    await loadRom(await downloadGame(message=>{$('status').textContent=message;}));
  }
  catch(error){failStart(error.message);}
};
if(new URL(location.href).searchParams.get('fixture')==='local')await $('play').onclick();
$('end-session').onclick=()=>{if(loaded&&!ending){worker?.postMessage({type:'release-buttons'});$('end-dialog').showModal();}};
$('cancel-end').onclick=()=>$('end-dialog').close();
$('end-dialog').addEventListener('close',()=>{if(loaded&&!ending)$('screen').focus();});
$('confirm-end').onclick=async()=>{
  if(!loaded||ending)return;
  ending=true;$('end-dialog').close();syncSessionControls();$('status').textContent='Ending session…';
  const previous=worker;
  try{
    // Worker acknowledgement is ordered after all pending save messages.
    if(previous)await new Promise(resolve=>{
      const timer=setTimeout(resolve,2000);stopAck=()=>{clearTimeout(timer);resolve();};
      previous.postMessage({type:'stop-session'});
    });
    stopAck=null;worker=null;previous?.terminate();
    await saveChain;
  }catch(error){$('save-status').textContent='Session cleanup: '+error.message;}
  finally{
    presenter.clear();
    worker=null;previous?.terminate();stopAck=null;
    try{await audio.stop();}catch(error){$('status').textContent=error.message;}
    loaded=false;loading=false;failed=false;networkAvailable=false;stalled=false;lastFrame=0;
    window.removeEventListener('beforeunload',beforeUnload);
    unlockSave?.();unlockSave=null;key=null;
    ctx.clearRect(0,0,240,160);$('empty-screen').hidden=false;$('stats').textContent='Not running.';$('log').textContent='';delete window.harnessStats;
    $('join-form').hidden=true;$('join-code').value='';$('room-players').replaceChildren();
    showLink('idle','Start the game to connect.');$('status').textContent='Ready';
    try{await slots.refresh();}catch(error){$('save-status').textContent=error.message;}
    ending=false;syncSessionControls();
    $('play').focus();
  }
};
function downloadSave(bytes){
  const url=URL.createObjectURL(new Blob([bytes])),a=document.createElement('a');a.href=url;
  a.download=`quetzal-${slots.current().name.replace(/[^a-z0-9_-]/gi,'_')}.srm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('export').onclick=async()=>{
  if(ending||loading)return;
  if(loaded){worker?.postMessage({type:'export'});return;}
  try{const record=await readSave(db,slotKey(TARGET,slots.current().id));if(record)downloadSave(record.bytes);else throw Error('This slot has no saved progress yet.');}catch(e){$('save-status').textContent=e.message;}
};
$('import').onchange=async()=>{
  let release;
  try{const file=$('import').files[0],slot=slots.current();if(!file)return;const bytes=new Uint8Array(await file.arrayBuffer());
    if(bytes.length!==131072)throw Error('Expected a 128 KiB cartridge save (.srm/.sav), not an emulator snapshot.');
    const saveKey=slotKey(TARGET,slot.id);release=await lockSlot(TARGET,slot.id);
    if(await readSave(db,saveKey)&&!confirm(`Replace the saved progress in “${slot.name}”? Export a backup first if you want to keep it.`))return;
    await writeSave(db,saveKey,bytes);$('save-status').textContent=`Save imported · ${slot.name}`;await slots.refresh();
  }catch(e){$('save-status').textContent=e.message;}finally{release?.();$('import').value='';}
};
function connect(intent){
  if(!loaded||!networkAvailable||failed||ending||linkState!=='idle')return;
  const room=intent==='create'?newRoomCode():$('join-code').value.trim().toLowerCase();
  if(!/^[a-f0-9]{32}$/.test(room)){ $('link-status').textContent='Paste the complete 32-character room code from your friend.';return;}
  const transport=$('transport').value,endpoint=$('relay-url').value.trim();
  try{if(transport==='websocket')relaySocketURL(endpoint,room);}catch(error){$('link-status').textContent=error.message;return;}
  showLink('starting',intent==='create'?'Creating your room…':'Joining room…');
  worker.postMessage({type:'link',room,intent,transport,endpoint,delayMs:Number($('delay').value),jitterMs:Number($('jitter').value)});$('screen').focus();
}
$('host').onclick=()=>connect('create');
$('join-form').onsubmit=event=>{event.preventDefault();connect('join');};
$('leave').onclick=()=>{worker.postMessage({type:'unlink'});$('screen').focus();};
const player=$('game-player');
const roomHelp=$('room-help-button').parentElement;
roomHelp.addEventListener('pointerleave',()=>roomHelp.classList.remove('dismissed'));
roomHelp.addEventListener('focusin',()=>roomHelp.classList.remove('dismissed'));
$('room-help-button').addEventListener('keydown',event=>{if(event.key==='Escape'){roomHelp.classList.add('dismissed');$('room-help-button').blur();}});
if(!document.fullscreenEnabled){$('fullscreen').disabled=true;$('fullscreen').title='Fullscreen unavailable';$('fullscreen').setAttribute('aria-label','Fullscreen unavailable');}
$('fullscreen').onclick=async()=>{
  try{if(document.fullscreenElement===player)await document.exitFullscreen();else await player.requestFullscreen();}
  catch(error){$('status').textContent='Fullscreen unavailable: '+error.message;}
};
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&document.fullscreenElement===player){
    event.preventDefault();document.exitFullscreen().catch(error=>{$('status').textContent=error.message;});
  }
});
document.addEventListener('fullscreenchange',()=>{
  const active=document.fullscreenElement===player;
  $('fullscreen').title=active?'Exit fullscreen (Escape)':'Enter fullscreen';
  $('fullscreen').setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');
  $('fullscreen-symbol').setAttribute('d',active?'M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5':'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5');
  $('fullscreen').setAttribute('aria-pressed',String(active));if(loaded)$('screen').focus();
});
