import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalLink} from '../apps/harness/local-link.mjs';
import {newRoomCode} from '../apps/harness/relay-protocol.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<300;i++){if(check())return;await sleep(10);}throw Error('Local room timed out');}
function player(t){
  const states=[],starts=[],accepted=[],inbound=[];
  const core={HEAPU8:new Uint8Array(65536),_host_link_start(id){starts.push(id);return 1;},_host_link_stop(){},_host_connected(id){accepted.push(id);return 1;},_malloc(){return 0;},_free(){},_host_receive(ptr,len,id){inbound.push({bytes:this.HEAPU8.slice(ptr,ptr+len),id});}};
  const link=new LocalLink({core,onState:s=>states.push(s)});t.after(()=>link.close());return {link,states,starts,accepted,inbound};
}
test('local room assigns four IDs, broadcasts to all peers and respects targeted packets',async t=>{
  const players=Array.from({length:4},()=>player(t)),room=newRoomCode();
  players[0].link.start(room,'create');await until(()=>players[0].link.state==='hosting');
  for(const p of players.slice(1))p.link.start(room,'join');
  await until(()=>players.every(p=>p.link.members.length===4));
  assert.deepEqual(players.map(p=>p.link.id).sort(),[0,1,2,3]);assert.deepEqual(players[0].accepted.sort(),[1,2,3]);
  const bytes=new Uint8Array(24);new DataView(bytes.buffer).setUint32(0,0x4d504b31);
  for(const p of players)p.link.packet(5,bytes,65535);
  await until(()=>players.every(p=>p.link.queue.length===3));
  for(const p of players){assert.equal(p.inbound.length,0);p.link.drain();assert.equal(new Set(p.inbound.map(v=>v.id)).size,3);}
  players[0].link.packet(5,bytes,players[3].link.id);await until(()=>players[3].link.queue.length===1);
  assert.equal(players[1].link.queue.length,0);assert.equal(players[2].link.queue.length,0);
  const oldEpoch=players[3].link.epoch;players[3].link.stop();
  await until(()=>players.slice(0,3).every(p=>p.link.members.length===3));
  assert.equal(players[0].link.state,'connected');assert.equal(players[0].starts.length,2,'Departure restarts native session');
  players[3].link.start(room,'join');await until(()=>players.every(p=>p.link.members.length===4));
  players[0].link.message({type:'packet',from:players[3].link.id,epoch:oldEpoch,toEpoch:players[0].link.epoch,bytes});assert.equal(players[0].link.queue.length,0);
  players[0].link.stop();await until(()=>players.every(p=>p.link.state==='idle'));
});
test('pending connections cancel and failed core starts report an error',async t=>{
  const a=player(t);a.link.start(newRoomCode(),'join');assert.equal(a.link.state,'connecting');a.link.stop();assert.equal(a.link.state,'idle');
  a.link.core._host_link_start=()=>0;a.link.start(newRoomCode(),'create');await until(()=>a.link.state==='idle');assert.match(a.states.at(-1).reason,/could not start/);
});
