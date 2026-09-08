import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import WebSocket from 'ws';
import {BUILD_ID,ROM_SHA256,newRoomCode,encodePacket,decodePacket} from '../../apps/harness/relay-protocol.mjs';
import {LocalLink} from '../../apps/harness/local-link.mjs';
import {WebSocketChannel} from '../../apps/harness/websocket-channel.mjs';

const base=process.env.RELAY_TEST_URL??'http://127.0.0.1:8787';
const endpoint=base.replace(/^http/,'ws')+'/relay';
const origin='http://127.0.0.1:4173';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label,timeout=5000){
  const end=performance.now()+timeout;
  while(performance.now()<end){const value=predicate();if(value)return value;await sleep(5);}
  throw Error('Timed out: '+label);
}
async function client(t,room,id,build=BUILD_ID){
  const socket=new WebSocket(`${endpoint}/${room}`,{origin}),messages=[];
  socket.binaryType='arraybuffer';socket.on('error',()=>{});
  socket.on('message',(data,binary)=>messages.push(binary?decodePacket(data):JSON.parse(data.toString())));
  t.after(()=>socket.terminate());await until(()=>socket.readyState===1,'WebSocket open');
  const epoch=crypto.randomUUID();socket.send(JSON.stringify({type:'join',id,epoch,build}));
  return {socket,messages,epoch,next:type=>until(()=>messages.find(m=>m.type===type),type)};
}
function payload(n=0){const bytes=new Uint8Array(24),v=new DataView(bytes.buffer);v.setUint32(0,0x4d504b31);v.setUint32(4,0x80000002);v.setUint32(8,n);return bytes;}

test('packaged game downloads, decompresses and matches the pinned hash',async()=>{
  const manifest=await (await fetch(base+'/game-manifest.json')).json();assert.equal(manifest.build,BUILD_ID);
  const res=await fetch(base+manifest.url);assert.equal(res.status,200);
  assert.match(res.headers.get('cache-control'),/immutable/);
  const rom=gunzipSync(Buffer.from(await res.arrayBuffer()));
  assert.equal(createHash('sha256').update(rom).digest('hex'),ROM_SHA256);
  const html=await (await fetch(base+'/')).text();assert.ok(html.includes('Play / Continue'));assert.ok(!html.includes('id="rom"'));
});
test('relay assigns sender identities, preserves packets and propagates departure',async t=>{
  const room=newRoomCode(),a=await client(t,room,0),b=await client(t,room,1);await a.next('joined');await b.next('joined');
  for(let n=0;n<20;n++){
    const packet=encodePacket(5,payload(n));new Uint8Array(packet)[2]=1; // Attempt to spoof the sender.
    a.socket.send(packet);
  }
  await until(()=>b.messages.filter(m=>m.bytes).length===20,'ordered packets');
  const packets=b.messages.filter(m=>m.bytes);
  assert.deepEqual(packets.map(m=>m.sequence),Array.from({length:20},(_,i)=>i+1));
  assert.deepEqual(packets.map(m=>new DataView(m.bytes.buffer).getUint32(8)),Array.from({length:20},(_,i)=>i));
  assert.ok(packets.every(m=>m.from===0));b.socket.send(JSON.stringify({type:'ack',sequence:20}));
  b.socket.close();assert.match((await a.next('error')).message,/Peer left/);
});
test('duplicate host and incompatible build are rejected without evicting the host',async t=>{
  const room=newRoomCode(),a=await client(t,room,0);await a.next('joined');
  const duplicate=await client(t,room,0);assert.match((await duplicate.next('error')).message,/host already/);
  await until(()=>duplicate.socket.readyState===3,'duplicate closes');
  const mismatch=await client(t,room,1,'wrong-build');assert.match((await mismatch.next('error')).message,/version mismatch/);
  a.socket.send(JSON.stringify({type:'ping',at:1}));assert.equal((await a.next('pong')).at,1);
});
test('unapproved origins cannot open a relay socket',async()=>{
  const result=await new Promise((resolve,reject)=>{
    const socket=new WebSocket(`${endpoint}/${newRoomCode()}`,{origin:'https://unapproved.example'});
    const timer=setTimeout(()=>{socket.terminate();reject(Error('Origin test timed out'));},3000);
    socket.on('unexpected-response',(_req,res)=>{clearTimeout(timer);res.resume();socket.terminate();resolve(res.statusCode);});
    socket.on('error',()=>{});
  });assert.equal(result,403);
});
test('malformed native packets close the session before reaching the other core',async t=>{
  const room=newRoomCode(),a=await client(t,room,0),b=await client(t,room,1);await a.next('joined');await b.next('joined');
  a.socket.send(new Uint8Array(32));assert.match((await a.next('error')).message,/Invalid relay packet/);
  await b.next('error');assert.equal(b.messages.filter(m=>m.bytes).length,0);
});
test('room isolation and full-room rejection',async t=>{
  const room=newRoomCode(),a=await client(t,room,0),b=await client(t,room,1),outsider=await client(t,newRoomCode(),1);
  await a.next('joined');await b.next('joined');await outsider.next('joined');
  // The full-room response can close before client() sends its join request.
  const messages=[],third=new WebSocket(`${endpoint}/${room}`,{origin});t.after(()=>third.terminate());
  third.on('error',()=>{});third.on('message',data=>messages.push(JSON.parse(data.toString())));
  await until(()=>messages.length,'full-room error');assert.match(messages[0].message,/full/);
  a.socket.send(encodePacket(5,payload(7)));await until(()=>b.messages.some(m=>m.bytes),'room packet');
  await sleep(50);assert.equal(outsider.messages.filter(m=>m.bytes).length,0);
});
test('join-first client waits for its host and cancellation closes the pair',async t=>{
  const room=newRoomCode(),links=[];
  const core=()=>({_host_link_start:()=>1,_host_link_stop:()=>{},_host_connected:()=>1});
  for(const id of [1,0]){
    const states=[];const link=new LocalLink({core:core(),onState:s=>states.push(s),channelFactory:(_name,peer)=>new WebSocketChannel({...peer,endpoint,socketFactory:url=>new WebSocket(url,{origin})})});
    t.after(()=>link.close());link.start(room,id);links.push(link);
    if(id===1){await until(()=>link.state==='searching','join-first waiting state');assert.equal(link.connected,false);}
  }
  await until(()=>links.every(l=>l.connected),'join-first connection');links[0].stop();await until(()=>links[1].state==='idle','peer cancellation');
});
test('receiver backpressure terminates the session instead of accumulating packets',async t=>{
  const room=newRoomCode(),a=await client(t,room,0),b=await client(t,room,1);await a.next('joined');await b.next('joined');
  for(let n=0;n<257;n++)a.socket.send(encodePacket(5,payload(n)));
  assert.match((await a.next('error')).message,/too slow/);await b.next('error');
  assert.equal(b.messages.filter(m=>m.bytes).length,256);
});

test('actual WASM cable handshake crosses the relay with injected RTT up to 250 ms',async t=>{
  const romPath=new URL('../../pokemon emerald/PokemonQuetzalEnglishAlpha8v4.gba',import.meta.url);
  if(!existsSync(romPath)){t.skip('Local ROM unavailable');return;}
  const {default:createCore}=await import('../../apps/harness/core/gpsp.mjs');const rom=readFileSync(romPath);
  for(const delayMs of [0,25,50,75,125]){
    const room=newRoomCode(),players=[];
    for(let id=0;id<2;id++){
      let link;const c=await createCore({print:()=>{},printErr:()=>{},onPacket:(flags,bytes,to)=>link.packet(flags,bytes,to)});
      c.FS.mkdir('/game');c.FS.writeFile('/game/test.gba',rom);assert.equal(c.ccall('host_load','number',['string'],['/game/test.gba']),1);
      const states=[];link=new LocalLink({core:c,onState:s=>states.push(s),channelFactory:(_name,peer)=>new WebSocketChannel({...peer,endpoint,delayMs,socketFactory:url=>new WebSocket(url,{origin})})});
      t.after(()=>link.close());link.start(room,id);players.push({c,link,states});
    }
    const [a,b]=players;await until(()=>a.link.connected&&b.link.connected,'frontend handshake');
    const ai=a.c._host_io_registers()/2,bi=b.c._host_io_registers()/2;
    a.c.HEAPU16[ai+0x9a]=0;b.c.HEAPU16[bi+0x9a]=0;
    a.c.HEAPU16[ai+0x95]=0xb9a0;b.c.HEAPU16[bi+0x95]=0xb9a0;
    b.c._write_siocnt(0x6003);a.c._write_siocnt(0x6083);
    await until(()=>b.link.queue.length>0,'host packet');b.link.drain();b.c._update_serial(280065);
    await until(()=>a.link.queue.length>0,'child response');a.link.drain();a.c._update_serial(10000);a.c._write_siocnt(0x6083);
    assert.equal(a.c.HEAPU16[ai+0x91],0xb9a0,'Host sees child via real WebSockets');
    await until(()=>Number.isFinite(a.link.rttMs),'peer RTT');
    console.log(`Device handshake: added RTT ${delayMs*2} ms; measured peer RTT ${a.link.rttMs} ms`);
    a.link.stop();b.link.close();
  }
  // Device-level feasibility, not a Quetzal gameplay or internet stability claim.
});
