import {BUILD_ID,ROM_SHA256,ROM_SIZE} from './relay-protocol.mjs';
export async function downloadGame(onProgress){
  const response=await fetch('./game-manifest.json',{cache:'no-store'});
  if(!response.ok)throw Error('Game content is unavailable. For local development, start the server with --local-fixture.');
  const m=await response.json();
  if(m.build!==BUILD_ID||m.sha256!==ROM_SHA256||m.size!==ROM_SIZE||!['gzip','raw'].includes(m.encoding))throw Error('Game release mismatch. Refresh to get the current player.');
  const url=new URL(m.url,location.href);
  if(url.origin!==location.origin)throw Error('Unexpected game content origin.');
  const download=await fetch(url);
  if(!download.ok||!download.body)throw Error('Game download failed. Press Play to retry.');
  const reader=download.body.getReader(),chunks=[];let length=0;
  while(true){
    const {done,value}=await reader.read();if(done)break;
    length+=value.length;if(length>ROM_SIZE){await reader.cancel();throw Error('Game download exceeded the expected size.');}
    chunks.push(value);onProgress(`Downloading game… ${Math.round(length/1048576)} MB`);
  }
  onProgress('Preparing game…');
  const blob=new Blob(chunks);let stream=blob.stream();
  if(m.encoding==='gzip')stream=stream.pipeThrough(new DecompressionStream('gzip'));
  const decoded=stream.getReader(),output=new Uint8Array(ROM_SIZE);let offset=0;
  while(true){
    const {done,value}=await decoded.read();if(done)break;
    if(offset+value.length>ROM_SIZE){await decoded.cancel();throw Error('Invalid game content size.');}
    output.set(value,offset);offset+=value.length;
  }
  if(offset!==ROM_SIZE)throw Error('Game download was incomplete. Press Play to retry.');
  // main.mjs verifies the pinned hash before passing these bytes to the core.
  return output.buffer;
}
