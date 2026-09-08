import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createGameLoader} from '../apps/harness/game-loader.mjs';
import {AudioRing} from '../apps/harness/audio-buffer.mjs';
import {createPresenter} from '../apps/harness/video.mjs';

function fixture(encoding='gzip'){
  const bytes=new Uint8Array(4096).fill(42),sha256=createHash('sha256').update(bytes).digest('hex');
  const manifest={build:'test',sha256,size:bytes.length,encoding,url:'/game/test.gz'};
  const state={manifest,payload:encoding==='gzip'?gzipSync(bytes):bytes,manifests:0,downloads:0};
  const load=createGameLoader({baseURL:'https://example.test/game-loader.mjs',...manifest,fetcher:async(url,options)=>{
    if(url.pathname==='/game-manifest.json'){assert.equal(options.cache,'no-store');state.manifests++;return Response.json(state.manifest);}
    state.downloads++;return new Response(state.payload);
  }});
  return {load,state,bytes};
}
test('verified content is retained, with a fresh release check on every session',async()=>{
  const {load,state,bytes}=fixture();
  const first=await load();assert.deepEqual(first,bytes);
  assert.equal(await load(),first);assert.equal(state.downloads,1);assert.equal(state.manifests,2);
  state.manifest.build='other-release';await assert.rejects(load(),/release mismatch/);
  assert.equal(state.downloads,1);
});
test('concurrent startup requests share preparation and failed integrity checks can retry',async()=>{
  const {load,state,bytes}=fixture('raw');
  state.payload=new Uint8Array(bytes.length).fill(1);
  await assert.rejects(load(),/checksum mismatch/);
  state.payload=bytes;
  const [a,b]=await Promise.all([load(),load()]);assert.equal(a,b);assert.deepEqual(a,bytes);
  assert.equal(state.downloads,2);
});
test('loader rejects cross-origin, incomplete, excessive and corrupt content',async()=>{
  const badOrigin=fixture();badOrigin.state.manifest.url='https://other.test/game.gz';
  await assert.rejects(badOrigin.load(),/origin/);assert.equal(badOrigin.state.downloads,0);
  const short=fixture('raw');short.state.payload=new Uint8Array(100);
  await assert.rejects(short.load(),/incomplete/);
  const long=fixture('raw');long.state.payload=new Uint8Array(4097);
  await assert.rejects(long.load(),/exceeded/);
  const expanded=fixture();expanded.state.payload=gzipSync(new Uint8Array(8192));
  await assert.rejects(expanded.load(),/Invalid game content size/);
  const corrupt=fixture();corrupt.state.payload=new Uint8Array([1,2,3]);
  await assert.rejects(corrupt.load());
});

function pcm(frames){const result=new Int16Array(frames*2);for(let i=0;i<result.length;i+=2){result[i]=16384;result[i+1]=-8192;}return result;}
for(const rate of [22050,44100,48000,96000])test(`audio streams stereo at ${rate} Hz without accumulating delay`,()=>{
  const ring=new AudioRing(rate),left=new Float32Array(128),right=new Float32Array(128);
  ring.push(pcm(ring.target+550));
  let generated=0;
  for(let block=0;block<Math.ceil(rate*10/128);block++){
    const due=Math.floor((block+1)*128/rate*32768),frames=due-generated;generated=due;
    ring.push(pcm(frames));ring.render(left,right);
    assert.ok(ring.count>=0&&ring.count<=ring.limit);
    assert.ok(Math.abs(left[127]-.5)<.00001);assert.ok(Math.abs(right[127]+.25)<.00001);
  }
  const stats=ring.stats();assert.equal(stats.underruns,0);assert.equal(stats.overruns,0);
  assert.ok(stats.queueMs>=40&&stats.queueMs<=60);assert.ok(stats.renderedSamples>=rate*10);
});
test('audio recovers from starvation and drops stale excess audio with bounded storage',()=>{
  const ring=new AudioRing(48000),storage=ring.samples;
  const left=new Float32Array(4800),right=new Float32Array(4800);
  ring.push(pcm(ring.target));ring.render(left,right);
  assert.equal(ring.stats().underruns,1);assert.ok(left.every(Number.isFinite));assert.ok(Math.abs(left.at(-1))<.0001);
  ring.push(pcm(ring.target));ring.render(left.subarray(0,128),right.subarray(0,128));assert.ok(left[127]>.49);
  ring.push(pcm(ring.limit*3));assert.equal(ring.stats().overruns,1);assert.equal(ring.count,ring.limit);assert.equal(ring.samples,storage);
  ring.reset();assert.equal(ring.count,0);assert.equal(ring.started,false);
});
test('presentation keeps the latest frame and returns buffers after display or cancellation',()=>{
  let callback;const drawn=[],returned=[];
  const presenter=createPresenter(frame=>drawn.push(frame),{request:cb=>{assert.equal(callback,undefined);callback=cb;return 1;},cancel:()=>{callback=undefined;}});
  const a=new Uint8ClampedArray(4),b=new Uint8ClampedArray(4),c=new Uint8ClampedArray(4);
  presenter.submit(a,buffer=>returned.push(buffer));presenter.submit(b,buffer=>returned.push(buffer));
  assert.deepEqual(returned,[a.buffer]);const run=callback;callback=undefined;run();
  assert.deepEqual(drawn,[b]);assert.deepEqual(returned,[a.buffer,b.buffer]);assert.deepEqual(presenter.stats(),{presented:1,replaced:1});
  presenter.submit(c,buffer=>returned.push(buffer));presenter.clear();
  assert.equal(callback,undefined);assert.deepEqual(returned,[a.buffer,b.buffer,c.buffer]);assert.deepEqual(drawn,[b]);
});
