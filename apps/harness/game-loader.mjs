import {BUILD_ID,ROM_SHA256,ROM_SIZE} from './relay-protocol.mjs';
export function createGameLoader({fetcher=globalThis.fetch,baseURL=import.meta.url,build=BUILD_ID,sha256=ROM_SHA256,size=ROM_SIZE}={}){
let cached;
return async function load(onProgress=()=>{}){
  const response=await fetcher(new URL('./game-manifest.json',baseURL),{cache:'no-store'});
  if(!response.ok)throw Error('Game content is unavailable. For local development, start the server with --local-fixture.');
  const m=await response.json();
  if(m.build!==build||m.sha256!==sha256||m.size!==size||!['gzip','raw'].includes(m.encoding))throw Error('Game release mismatch. Refresh to get the current player.');
  const url=new URL(m.url,baseURL);
  if(url.origin!==new URL(baseURL).origin)throw Error('Unexpected game content origin.');
  if(cached){onProgress('Loading cached game…');return cached;}
  cached=prepare(url,m.encoding,onProgress).catch(error=>{cached=null;throw error;});
  return cached;
};
async function prepare(url,encoding,onProgress){
  const download=await fetcher(url);
  if(!download.ok||!download.body)throw Error('Game download failed. Press Play to retry.');
  const reader=download.body.getReader(),chunks=[];let length=0,lastMB=-1;
  while(true){
    const {done,value}=await reader.read();if(done)break;
    length+=value.length;if(length>size){await reader.cancel();throw Error('Game download exceeded the expected size.');}
    chunks.push(value);const mb=Math.round(length/1048576);if(mb!==lastMB){lastMB=mb;onProgress(`Loading game… ${mb} MB`);}
  }
  onProgress('Preparing game…');
  const blob=new Blob(chunks);let stream=blob.stream();
  if(encoding==='gzip')stream=stream.pipeThrough(new DecompressionStream('gzip'));
  const decoded=stream.getReader(),output=new Uint8Array(size);let offset=0;
  while(true){
    const {done,value}=await decoded.read();if(done)break;
    if(offset+value.length>size){await decoded.cancel();throw Error('Invalid game content size.');}
    output.set(value,offset);offset+=value.length;
  }
  if(offset!==size)throw Error('Game download was incomplete. Press Play to retry.');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',output)),n=>n.toString(16).padStart(2,'0')).join('');
  if(digest!==sha256)throw Error('Game checksum mismatch. Press Play to retry.');
  return output;
}
}
