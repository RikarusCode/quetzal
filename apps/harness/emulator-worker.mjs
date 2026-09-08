import createCore from './core/gpsp.mjs';
import {LocalLink} from './local-link.mjs';
import {WebSocketChannel} from './websocket-channel.mjs';
let core, buttons=0, pressed=0, running=false, lastSave, stableSaveTicks=0;
let link,transport='local',frames=0,elapsed=0,nextFrame=0,lastStats=0;
let timer,audioPort,audioActive=false,audioReady=false,skippedVideo=0;
const videoPool=Array.from({length:3},()=>new ArrayBuffer(153600));
const colors=new Uint32Array(65536),littleEndian=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
for(let c=0;c<colors.length;c++){
  const r=Math.round(((c>>11)&31)*255/31),g=Math.round(((c>>5)&63)*255/63),b=Math.round((c&31)*255/31);
  colors[c]=littleEndian?(r|(g<<8)|(b<<16)|0xff000000):((r<<24)|(g<<16)|(b<<8)|255);
}
const FRAME=1000/59.72750057;
const post=(type,data={})=>postMessage({type,...data});
// Compile/fetch WASM while the separate game loader prepares the ROM.
const preparedCore=createCore({printErr:text=>post('log',{text}),onPacket:(flags,bytes,to)=>link?.packet(flags,bytes,to)})
  .then(value=>({value}),error=>({error}));
function fail(error){running=false;link?.stop('Emulator stopped: '+error.message);post('error',{message:error.message});}
function tick(){try{runFrame();}catch(error){fail(error);}}
function runFrame(){
  if(!running)return;
  const start=performance.now();
  link.drain();
  core._host_frame(buttons|pressed);pressed=0;frames++;
  const buffer=videoPool.pop();
  if(buffer){
    const rgb=core.HEAPU16.subarray(core._host_pixels()/2,core._host_pixels()/2+38400),pixels=new Uint32Array(buffer);
    for(let i=0;i<rgb.length;i++)pixels[i]=colors[rgb[i]];
    postMessage({type:'frame',rgba:new Uint8ClampedArray(buffer)},[buffer]);
  }else skippedVideo++;
  if(audioPort&&audioActive&&audioReady){
    const count=core._host_audio_frames(),offset=core._host_audio()/2;
    const audio=core.HEAP16.slice(offset,offset+count*2);audioPort.postMessage(audio,[audio.buffer]);
  }
  elapsed+=performance.now()-start;
  if(frames%60===0){
    const bytes=core.HEAPU8.slice(core._host_save(),core._host_save()+core._host_save_size());
    if(lastSave && bytes.every((v,i)=>v===lastSave[i])) stableSaveTicks++;
    else {lastSave=bytes;stableSaveTicks=0;}
    // Stability is a prototype heuristic, not a game-aware completed-save detector.
    if(stableSaveTicks===2 && !bytes.every(v=>v===255))post('save',{bytes});
  }
  if(start-lastStats>1000){post('stats',{frames,skippedVideo,sent:link.sent,received:link.received,queue:link.queue.length,averageMs:elapsed/frames,connected:link.connected,linkState:link.state,transport,peerRttMs:link.rttMs??null,relayRttMs:link.channel?.relayRttMs??null,delayedPackets:link.channel?.pending?.length??0,addedReceiveDelayMs:link.channel?.delayMs??0,outgoingBufferedBytes:link.channel?.socket?.bufferedAmount??0,serialMode:core._host_serial_mode()===3?'Pokémon Gen3 link cable':'Unexpected mode',siocnt:'0x'+core.HEAPU16[core._host_io_registers()/2+0x94].toString(16)});lastStats=start;}
  nextFrame+=FRAME;
  if(nextFrame<performance.now()-FRAME*3)nextFrame=performance.now();
  timer=setTimeout(tick,Math.max(0,nextFrame-performance.now()));
}
onmessage=async({data:m})=>{
  try{
    if(m.type==='load'){
      if(core)throw Error('Reload the page before loading another ROM');
      const prepared=await preparedCore;if(prepared.error)throw prepared.error;core=prepared.value;
      link=new LocalLink({core,onState:data=>post('link',data)});
      core.FS.mkdir('/game');core.FS.writeFile('/game/quetzal.gba',new Uint8Array(m.rom));
      if(!core.ccall('host_load','number',['string'],['/game/quetzal.gba']))throw Error('gpSP could not load the ROM');
      if(m.save){if(m.save.length!==core._host_save_size())throw Error('Save size does not match core');core.HEAPU8.set(m.save,core._host_save());}
      post('ready',{network:!!core._host_has_network(),saveSize:core._host_save_size()});
      running=true;nextFrame=performance.now();tick();
    }else if(m.type==='video-buffer'){if(m.buffer?.byteLength===153600&&videoPool.length<3)videoPool.push(m.buffer);}
    else if(m.type==='audio-connect'){
      audioPort?.close();audioPort=m.port;audioActive=!!m.active;audioReady=false;
      const port=audioPort;port.onmessage=({data})=>{if(port===audioPort&&data.type==='ready')audioReady=true;};
    }
    else if(m.type==='audio-active'){audioActive=!!m.active;}
    else if(m.type==='audio-disconnect'){audioPort?.close();audioPort=null;audioActive=false;}
    else if(m.type==='buttons'){pressed|=m.mask & ~buttons;buttons=m.mask;}
    else if(m.type==='release-buttons'){pressed=0;buttons=0;}
    else if(m.type==='link'){
      if(link.state!=='idle')return;
      transport=m.transport==='websocket'?'websocket':'local';
      link=new LocalLink({core,onState:data=>post('link',data),...(transport==='websocket'?{
        channelFactory:(_name,peer)=>new WebSocketChannel({...peer,endpoint:m.endpoint,delayMs:m.delayMs,jitterMs:m.jitterMs})
      }:{})});
      link.start(m.room,m.intent);
    }
    else if(m.type==='stop-session'){running=false;clearTimeout(timer);buttons=0;pressed=0;audioPort?.close();audioPort=null;link?.stop();post('stopped');}
    else if(m.type==='unlink')link.stop();
    else if(m.type==='export')post('export',{bytes:core.HEAPU8.slice(core._host_save(),core._host_save()+core._host_save_size())});
  }catch(error){post('error',{message:error.message});}
};
