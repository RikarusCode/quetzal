import createCore from './core/gpsp.mjs';
import {LocalLink} from './local-link.mjs';
import {WebSocketChannel} from './websocket-channel.mjs';
let core, buttons=0, pressed=0, running=false, lastSave, stableSaveTicks=0;
let link,transport='local',frames=0,elapsed=0,nextFrame=0,lastStats=0;
const FRAME=1000/59.72750057;
const post=(type,data={})=>postMessage({type,...data});
function fail(error){running=false;link?.stop('Emulator stopped: '+error.message);post('error',{message:error.message});}
function tick(){try{runFrame();}catch(error){fail(error);}}
function runFrame(){
  if(!running)return;
  const start=performance.now();
  link.drain();
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
  if(start-lastStats>1000){post('stats',{frames,sent:link.sent,received:link.received,queue:link.queue.length,averageMs:elapsed/frames,connected:link.connected,linkState:link.state,transport,peerRttMs:link.rttMs??null,relayRttMs:link.channel?.relayRttMs??null,delayedPackets:link.channel?.pending?.length??0,addedReceiveDelayMs:link.channel?.delayMs??0,outgoingBufferedBytes:link.channel?.socket?.bufferedAmount??0,serialMode:core._host_serial_mode()===3?'Pokémon Gen3 link cable':'Unexpected mode',siocnt:'0x'+core.HEAPU16[core._host_io_registers()/2+0x94].toString(16)});lastStats=start;}
  nextFrame+=FRAME;
  if(nextFrame<performance.now()-FRAME*3)nextFrame=performance.now();
  setTimeout(tick,Math.max(0,nextFrame-performance.now()));
}
onmessage=async({data:m})=>{
  try{
    if(m.type==='load'){
      if(core)throw Error('Reload the page before loading another ROM');
      core=await createCore({printErr:text=>post('log',{text}),onPacket:(flags,bytes,to)=>link?.packet(flags,bytes,to)});
      link=new LocalLink({core,onState:data=>post('link',data)});
      core.FS.mkdir('/game');core.FS.writeFile('/game/quetzal.gba',new Uint8Array(m.rom));
      if(!core.ccall('host_load','number',['string'],['/game/quetzal.gba']))throw Error('gpSP could not load the ROM');
      if(m.save){if(m.save.length!==core._host_save_size())throw Error('Save size does not match core');core.HEAPU8.set(m.save,core._host_save());}
      post('ready',{network:!!core._host_has_network(),saveSize:core._host_save_size()});
      running=true;nextFrame=performance.now();tick();
    }else if(m.type==='buttons'){pressed|=m.mask & ~buttons;buttons=m.mask;}
    else if(m.type==='release-buttons'){pressed=0;buttons=0;}
    else if(m.type==='link'){
      if(link.state!=='idle')return;
      transport=m.transport==='websocket'?'websocket':'local';
      link=new LocalLink({core,onState:data=>post('link',data),...(transport==='websocket'?{
        channelFactory:(_name,peer)=>new WebSocketChannel({...peer,endpoint:m.endpoint,delayMs:m.delayMs,jitterMs:m.jitterMs})
      }:{})});
      link.start(m.room,m.id);
    }
    else if(m.type==='unlink')link.stop();
    else if(m.type==='export')post('export',{bytes:core.HEAPU8.slice(core._host_save(),core._host_save()+core._host_save_size())});
  }catch(error){post('error',{message:error.message});}
};
