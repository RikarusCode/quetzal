import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoomCode,ROOM_PATTERN,encodePacket,decodePacket,relaySocketURL} from '../apps/harness/relay-protocol.mjs';
test('room codes and relay URLs cannot inject credentials or unencrypted remote endpoints',()=>{
  const room=newRoomCode();assert.match(room,ROOM_PATTERN);
  assert.equal(relaySocketURL('wss://example.com/relay',room),`wss://example.com/relay/${room}`);
  for(const endpoint of ['http://example.com/relay','ws://example.com/relay','wss://name:password@example.com/relay','wss://example.com/relay?token=value'])assert.throws(()=>relaySocketURL(endpoint,room));
  assert.throws(()=>relaySocketURL('wss://example.com/relay','../room'));
});
test('relay protocol rejects oversized data and unsupported native packet states',()=>{
  assert.throws(()=>encodePacket(5,new Uint8Array(25)));assert.throws(()=>decodePacket(new ArrayBuffer(65536)));
  const bytes=new Uint8Array(24),view=new DataView(bytes.buffer);view.setUint32(0,0x4d504b31);view.setUint32(4,3);
  assert.throws(()=>encodePacket(5,bytes));view.setUint32(4,2);
  assert.deepEqual(decodePacket(encodePacket(5,bytes)).bytes,bytes);assert.throws(()=>encodePacket(8,bytes));
});
