import createCore from './core/gpsp.mjs';
let core, buttons=0, pressed=0, running=false, lastSave, stableSaveTicks=0;
let channel, peerId, connected=false, queue=[], sent=0,received=0,frames=0,elapsed=0;
let nextFrame=0,lastStats=0,linkEpoch='',remoteEpoch='',lastPeer=0,helloTimer;
const FRAME=1000/59.72750057;
const post=(type,data={})=>postMessage({type,...data});
function stopLink(reason='Disconnected') {
  if(core)core._host_link_stop(); connected=false;queue=[];
  clearInterval(helloTimer);channel?.close();channel=null;post('link',{connected:false,reason});
}
function send(type,data={}) {channel?.postMessage({type,from:peerId,epoch:linkEpoch,toEpoch:remoteEpoch,...data});}
function link(room,id) {
  stopLink();peerId=id;linkEpoch=crypto.randomUUID();remoteEpoch='';
  channel=new BroadcastChannel(`quetzal-rfu-8d268a6-${room}`);lastPeer=performance.now();
  if(id===0)core._host_link_start(0);
  channel.onmessage=({data:m})=>{
    if(m.from===peerId||![0,1].includes(m.from))return;
    if(m.type==='hello' && peerId===0){
      if(connected && remoteEpoch!==m.epoch)return;
      if(!connected){if(!core._host_connected(1))return;remoteEpoch=m.epoch;connected=true;post('link',{connected:true});}
      send('ready');lastPeer=performance.now();return;
    }
    if(m.type==='ready' && peerId===1 && m.toEpoch===linkEpoch){
      if(!connected){remoteEpoch=m.epoch;core._host_link_start(1);connected=true;post('link',{connected:true});}
      lastPeer=performance.now();return;
    }
    if(!connected||m.epoch!==remoteEpoch||m.toEpoch!==linkEpoch)return;
    lastPeer=performance.now();
    if(m.type==='stop'){stopLink('Peer left; rejoin in the game');return;}
    if(m.type==='packet'){
      if(!(m.bytes instanceof Uint8Array)||m.bytes.length>65536||queue.length>=512){stopLink('Packet queue overflow');return;}
      queue.push(m);
    }
  };
  helloTimer=setInterval(()=>{if(!connected && peerId===1)send('hello');else if(connected)send('heartbeat');},250);
}
function tick(){
  if(!running)return;
  const start=performance.now();
  if(connected && start-lastPeer>5000)stopLink('Peer stopped responding');
  for(const p of queue.splice(0)){
    const ptr=core._malloc(p.bytes.length);core.HEAPU8.set(p.bytes,ptr);
    core._host_receive(ptr,p.bytes.length,p.from);core._free(ptr);received++;
  }
  core._host_frame(buttons|pressed);pressed=0;frames++;
  const rgb=core.HEAPU16.subarray(core._host_pixels()/2,core._host_pixels()/2+38400);
  const rgba=new Uint8ClampedArray(153600);
  for(let i=0;i<rgb.length;i++){const c=rgb[i],j=i*4;rgba[j]=((c>>11)&31)*255/31;rgba[j+1]=((c>>5)&63)*255/63;rgba[j+2]=(c&31)*255/31;rgba[j+3]=255;}
  const count=core._host_audio_frames(),offset=core._host_audio()/2;
  const audio=core.HEAP16.slice(offset,offset+count*2);
  postMessage({type:'frame',rgba,audio},[rgba.buffer,audio.buffer]);
  elapsed+=performance.now()-start;
  if(frames%60===0){
    const bytes=core.HEAPU8.slice(core._host_save(),core._host_save()+core._host_save_size());
    if(lastSave && bytes.every((v,i)=>v===lastSave[i])) stableSaveTicks++;
    else {lastSave=bytes;stableSaveTicks=0;}
    // Stability is a prototype heuristic, not a game-aware completed-save detector.
    if(stableSaveTicks===2 && !bytes.every(v=>v===255))post('save',{bytes});
  }
  if(start-lastStats>1000){post('stats',{frames,sent,received,queue:queue.length,averageMs:elapsed/frames,connected});lastStats=start;}
  nextFrame+=FRAME;
  if(nextFrame<performance.now()-FRAME*3)nextFrame=performance.now();
  setTimeout(tick,Math.max(0,nextFrame-performance.now()));
}
onmessage=async({data:m})=>{
  try{
    if(m.type==='load'){
      if(core)throw Error('Reload the page before loading another ROM');
      core=await createCore({printErr:text=>post('log',{text}),onPacket:(flags,bytes,to)=>{
        if(connected && (to===65535 || to!==peerId)){send('packet',{bytes,flags});sent++;}
      }});
      core.FS.mkdir('/game');core.FS.writeFile('/game/quetzal.gba',new Uint8Array(m.rom));
      if(!core.ccall('host_load','number',['string'],['/game/quetzal.gba']))throw Error('gpSP could not load the ROM');
      if(m.save){if(m.save.length!==core._host_save_size())throw Error('Save size does not match core');core.HEAPU8.set(m.save,core._host_save());}
      post('ready',{network:!!core._host_has_network(),saveSize:core._host_save_size()});
      running=true;nextFrame=performance.now();tick();
    }else if(m.type==='buttons'){pressed|=m.mask & ~buttons;buttons=m.mask;}
    else if(m.type==='release-buttons'){pressed=0;buttons=0;}
    else if(m.type==='link')link(m.room,m.id);
    else if(m.type==='unlink'){send('stop');stopLink();}
    else if(m.type==='export')post('export',{bytes:core.HEAPU8.slice(core._host_save(),core._host_save()+core._host_save_size())});
  }catch(error){post('error',{message:error.message});}
};
