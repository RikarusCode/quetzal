export const BUILD_ID='quetzal-8v4-e9fc9cf506ad11db-gpsp-8d268a6-mul_poke-v1';
export const ROM_SHA256='e9fc9cf506ad11db7642e7d65774e2bb0e5f174eb9aceda725cd961ab9aee070';
export const ROM_SIZE=33554432;
export const RELAY_VERSION=1;
export const MAX_PENDING_PACKETS=256;
export const MAX_SOCKET_BUFFER=65536;
export const ROOM_PATTERN=/^[a-f0-9]{32}$/;
export function newRoomCode(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');}
// Only the pinned core's 24-byte Pokémon Gen3 packets are supported.
export function validGamePacket(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length!==24)return false;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return view.getUint32(0)===0x4d504b31&&(view.getUint32(4)&0x7fffffff)<=2;
}
export function encodePacket(flags,bytes){
  if(!validGamePacket(bytes)||!Number.isInteger(flags)||(flags&~5)!==0)throw Error('Unsupported emulator packet.');
  const frame=new Uint8Array(32);frame[0]=RELAY_VERSION;frame[1]=flags;frame.set(bytes,8);return frame.buffer;
}
export function decodePacket(buffer){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength!==32)throw Error('Invalid relay packet length.');
  const frame=new Uint8Array(buffer);
  if(frame[0]!==RELAY_VERSION||(frame[1]&~5)!==0||frame[2]>1||frame[3]!==0||!validGamePacket(frame.subarray(8)))throw Error('Invalid relay packet.');
  return {flags:frame[1],from:frame[2],sequence:new DataView(buffer).getUint32(4),bytes:frame.slice(8)};
}
export function relaySocketURL(endpoint,room){
  const url=new URL(endpoint);
  if(!['ws:','wss:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Use a ws:// or wss:// relay URL without credentials or query parameters.');
  if(!ROOM_PATTERN.test(room))throw Error('Paste the host’s 32-character room code.');
  if(url.protocol==='ws:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Internet relays must use wss://.');
  url.pathname=url.pathname.replace(/\/$/,'')+'/'+room;return url.href;
}
