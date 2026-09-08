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
  const epoch=crypto.randomUUID();socket.send(JSON.stringify({type:'join',intent:id===0?'create':'join',epoch,build}));
  await until(()=>messages.some(m=>m.type==='joined'||m.type==='error'),'Join result');
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
  b.socket.close();await until(()=>a.messages.filter(m=>m.type==='roster').at(-1)?.members.length===1,'Guest departure roster');
  assert.equal(a.socket.readyState,1,'The host keeps the room after a guest leaves');
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
  const room=newRoomCode(),a=await client(t,room,0);await a.next('joined');
  const b=await client(t,room,1),c=await client(t,room,1),d=await client(t,room,1),outsider=await client(t,newRoomCode(),0);
  await b.next('joined');await c.next('joined');await d.next('joined');await outsider.next('joined');
  // The full-room response can close before client() sends its join request.
  const messages=[],third=new WebSocket(`${endpoint}/${room}`,{origin});t.after(()=>third.terminate());
  third.on('error',()=>{});third.on('message',data=>messages.push(JSON.parse(data.toString())));
  await until(()=>messages.length,'full-room error');assert.match(messages[0].message,/full/);
  a.socket.send(encodePacket(5,payload(7)));await until(()=>b.messages.some(m=>m.bytes),'room packet');
  await sleep(50);assert.equal(outsider.messages.filter(m=>m.bytes).length,0);
});
test('joining a missing room fails clearly without creating a lobby',async t=>{
  const guest=await client(t,newRoomCode(),1);assert.match((await guest.next('error')).message,/Room not found/);
});
test('receiver backpressure terminates the session instead of accumulating packets',async t=>{
  const room=newRoomCode(),a=await client(t,room,0),b=await client(t,room,1);await a.next('joined');await b.next('joined');
  for(let n=0;n<257;n++)a.socket.send(encodePacket(5,payload(n)));
  assert.match((await a.next('error')).message,/too slow/);await b.next('error');
  assert.equal(b.messages.filter(m=>m.bytes).length,256);
});

test('four-way routing, targeted packets, departure and replacement keep authoritative IDs',async t=>{
  const room=newRoomCode(),peers=[];
  peers.push(await client(t,room,0));for(let i=1;i<4;i++)peers.push(await client(t,room,1));
  assert.deepEqual(peers.map(p=>p.messages.find(m=>m.type==='joined').id),[0,1,2,3]);
  for(let id=0;id<4;id++){
    const frame=encodePacket(5,payload(id));new Uint8Array(frame)[2]=(id+1)%4;peers[id].socket.send(frame);
  }
  await until(()=>peers.every(p=>p.messages.filter(m=>m.bytes).length===3),'Four-way broadcasts');
  for(let id=0;id<4;id++){
    const received=peers[id].messages.filter(m=>m.bytes);
    assert.deepEqual(received.map(m=>m.from).sort(),[0,1,2,3].filter(n=>n!==id));
    assert.ok(received.every(m=>new DataView(m.bytes.buffer).getUint32(8)===m.from));
  }
  peers[2].socket.send(encodePacket(5,payload(99),3));await until(()=>peers[3].messages.filter(m=>m.bytes).length===4,'Targeted packet');
  assert.equal(peers[0].messages.filter(m=>m.bytes).length,3);assert.equal(peers[1].messages.filter(m=>m.bytes).length,3);
  peers[2].socket.close();await until(()=>peers[0].messages.filter(m=>m.type==='roster').at(-1)?.members.length===3,'Roster shrinks');
  const replacement=await client(t,room,1);assert.equal((await replacement.next('joined')).id,2);
  await until(()=>peers[0].messages.filter(m=>m.type==='roster').at(-1)?.members.length===4,'Roster grows');
  assert.notEqual(replacement.epoch,peers[2].epoch);
  peers[0].socket.close();for(const p of [peers[1],peers[3],replacement])assert.match((await p.next('error')).message,/host left/);
});

test('four actual WASM cores discover every peer over the relay with added RTT up to 250 ms',async t=>{
  const romPath=new URL('../../pokemon emerald/PokemonQuetzalEnglishAlpha8v4.gba',import.meta.url);
  if(!existsSync(romPath)){t.skip('Local ROM unavailable');return;}
  const {default:createCore}=await import('../../apps/harness/core/gpsp.mjs');const rom=readFileSync(romPath);
  const cores=[];let players=[];
  for(let index=0;index<4;index++){
    const c=await createCore({print:()=>{},printErr:()=>{},onPacket:(flags,bytes,to)=>players[index]?.link.packet(flags,bytes,to)});
    c.FS.mkdir('/game');c.FS.writeFile('/game/test.gba',rom);assert.equal(c.ccall('host_load','number',['string'],['/game/test.gba']),1);cores.push(c);
  }
  t.after(()=>players.forEach(p=>p.link.close()));
  for(const delayMs of [0,25,50,75,125]){
    const room=newRoomCode();players=[];
    for(let index=0;index<4;index++){
      const c=cores[index],states=[],link=new LocalLink({core:c,onState:s=>states.push(s),channelFactory:(_name,peer)=>new WebSocketChannel({...peer,endpoint,delayMs,socketFactory:url=>new WebSocket(url,{origin})})});
      players.push({c,link,states});link.start(room,index===0?'create':'join');
      await until(()=>link.members.length===index+1,'Assigned player number');
    }
    const [a,...guests]=players;await until(()=>players.every(p=>p.link.connected&&p.link.members.length===4),'Four-player roster');
    assert.deepEqual(players.map(p=>p.link.id),[0,1,2,3]);
    for(const p of players){const io=p.c._host_io_registers()/2;p.c.HEAPU16[io+0x9a]=0;p.c.HEAPU16[io+0x95]=0xb9a0;if(p.link.id)p.c._write_siocnt(0x6003);}
    a.c._write_siocnt(0x6083);
    await until(()=>guests.every(p=>p.link.queue.length>0),'Host broadcast reaches all three guests');
    for(const p of guests){p.link.drain();p.c._update_serial(280065);}
    await until(()=>a.link.queue.length===3&&guests.every(p=>p.link.queue.length===2),'Guest broadcasts reach every other peer');
    for(const p of players)p.link.drain();
    a.c._update_serial(12000);a.c._write_siocnt(0x6083); // Four serial words take 4 * 2621 cycles.
    const ai=a.c._host_io_registers()/2;
    assert.deepEqual(Array.from(a.c.HEAPU16.subarray(ai+0x91,ai+0x94)),[0xb9a0,0xb9a0,0xb9a0],'Host discovers three separate guest devices');
    for(const p of guests){
      p.c._update_serial(280065);const io=p.c._host_io_registers()/2;
      assert.deepEqual(Array.from(p.c.HEAPU16.subarray(io+0x90,io+0x94)),[0xb9a0,0xb9a0,0xb9a0,0xb9a0],'Each guest discovers host AND other guests');
    }
    await until(()=>Number.isFinite(a.link.rttMs),'peer RTT');
    console.log(`Four-device handshake: added RTT ${delayMs*2} ms; measured peer RTT ${a.link.rttMs} ms`);
    for(const p of players)p.link.close();
  }
  // Device-level feasibility, not a Quetzal gameplay or internet stability claim.
});
