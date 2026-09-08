import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalLink} from '../apps/harness/local-link.mjs';
function lab(t){
  let time=0;const channels=[],pending=[];
  const channelFactory=name=>{const c={name,postMessage(data){for(const other of channels)if(other!==c&&!other.closed&&other.name===name)pending.push(()=>{if(!other.closed)other.onmessage?.({data});});},close(){c.closed=true;}};channels.push(c);return c;};
  function player(){
    const states=[],starts=[],inbound=[];
    const core={HEAPU8:new Uint8Array(65536),_host_link_start(id){starts.push(id);return 1;},_host_link_stop(){},_host_connected(){return 1;},_malloc(){return 0;},_free(){},_host_receive(ptr,len,id){inbound.push({bytes:this.HEAPU8.slice(ptr,ptr+len),id});}};
    const link=new LocalLink({core,onState:s=>states.push(s),channelFactory,now:()=>time});t.after(()=>link.close());return {link,states,starts,inbound};
  }
  return {a:player(),b:player(),flush(){while(pending.length)pending.shift()();},advance(ms){time+=ms;}};
}
test('hosting/searching remain visible and waiting can be canceled',t=>{
  const {a,b}=lab(t);a.link.start('room',0);b.link.start('other',1);
  assert.deepEqual(a.states.map(s=>s.state),['hosting']);assert.deepEqual(b.states.map(s=>s.state),['searching']);
  a.link.stop();b.link.stop();assert.equal(a.states.at(-1).state,'idle');assert.equal(b.states.at(-1).state,'idle');
});
test('join before host, handshake once, ordered packets, disconnect and rejoin',t=>{
  const {a,b,flush}=lab(t);b.link.start('room',1);a.link.start('room',0);b.link.pulse();flush();
  assert.equal(a.link.connected,true);assert.equal(b.link.connected,true);assert.deepEqual(a.starts,[0]);assert.deepEqual(b.starts,[1]);
  a.link.packet(5,new Uint8Array([1,2]),65535);a.link.packet(5,new Uint8Array([3,4]),1);flush();
  assert.equal(b.inbound.length,0,'Core receive waits for owning frame');b.link.drain();
  assert.deepEqual(b.inbound.map(p=>Array.from(p.bytes)),[[1,2],[3,4]]);assert.equal(b.inbound[0].id,0);
  const oldEpoch=a.link.epoch;b.link.stop();flush();assert.equal(a.link.state,'idle');assert.match(a.states.at(-1).reason,/Peer left/);
  a.link.start('room',0);b.link.start('room',1);flush();assert.equal(b.link.connected,true);
  b.link.message({type:'packet',from:0,epoch:oldEpoch,toEpoch:b.link.epoch,bytes:new Uint8Array([99])});assert.equal(b.link.queue.length,0);
});
test('timeout and failed core startup report the actual state',t=>{
  const {a,b,flush,advance}=lab(t);a.link.start('room',0);b.link.start('room',1);flush();advance(5001);a.link.pulse();flush();
  assert.equal(a.link.state,'idle');assert.match(a.states.at(-1).reason,/stopped responding/);assert.equal(b.link.state,'idle');
  a.link.core._host_link_start=()=>0;a.link.start('room',0);assert.equal(a.link.state,'idle');assert.match(a.states.at(-1).reason,/could not start/);
});
