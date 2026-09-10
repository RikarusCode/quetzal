// Isolated browser profiling at the boot/title screens; no trainer progression.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base=process.env.UI_TEST_URL??'http://127.0.0.1:8787';
await mkdir('.local',{recursive:true});
const context=await chromium.launchPersistentContext(`.local/playback-browser-${Date.now()}`,{headless:true,channel:'msedge',viewport:{width:1440,height:1000}});
const page=await context.newPage(),errors=[],runs=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  window.profile={frames:[],long:[],firstFrame:0};window.testAudio=[];window.bufferSources=0;
  const draw=CanvasRenderingContext2D.prototype.putImageData,createGain=AudioContext.prototype.createGain,createSource=AudioContext.prototype.createBufferSource;
  CanvasRenderingContext2D.prototype.putImageData=function(...args){const start=performance.now();const result=draw.apply(this,args);window.profile.firstFrame||=start;window.profile.frames.push([start,performance.now()-start]);return result;};
  AudioContext.prototype.createGain=function(){window.testAudio.push(this);return createGain.call(this);};
  AudioContext.prototype.createBufferSource=function(){window.bufferSources++;return createSource.call(this);};
  new PerformanceObserver(list=>{for(const entry of list.getEntries())window.profile.long.push({at:entry.startTime,duration:entry.duration});}).observe({type:'longtask',buffered:true});
});
async function end(){await page.locator('#end-session').click();await page.locator('#confirm-end').click();await page.waitForFunction(()=>!document.querySelector('#play').disabled);}
async function open(){await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('#slot option').first().waitFor({state:'attached'});}
try{
  await open();
  for(const kind of ['cold','restart','reload']){
    if(kind==='reload')await open();
    const mark=await page.evaluate(()=>{window.profile={frames:[],long:[],firstFrame:0};return performance.now();});
    await page.locator('#play').click();await page.waitForFunction(()=>window.profile.firstFrame>0,null,{timeout:60000});
    await page.locator('#sound').click();await page.keyboard.press('Escape');
    await page.waitForFunction(()=>window.harnessStats?.audio?.renderedSamples>100000,null,{timeout:15000});
    if(kind==='cold')await page.waitForTimeout(8000);
    const loader=page.workers().find(worker=>worker.url().endsWith('/game-content-worker.mjs'));
    assert.ok(loader,'ROM preparation runs in its own worker');
    const resources=await loader.evaluate(()=>performance.getEntriesByType('resource').map(r=>({path:new URL(r.name).pathname,durationMs:r.duration,transferBytes:r.transferSize,encodedBytes:r.encodedBodySize})));
    const rom=resources.filter(r=>r.path.endsWith('.gba.gz'));
    assert.equal(rom.length,1,'session restarts do not download or decode another ROM');
    assert.equal(resources.filter(r=>r.path.endsWith('/game-manifest.json')).length,kind==='restart'?2:1);
    if(kind==='reload')assert.equal(rom[0].transferBytes,0,'refresh uses the immutable HTTP cache');
    const result=await page.evaluate(({kind,mark,rom})=>{
      const frames=window.profile.frames.filter(([at])=>at>window.profile.firstFrame+1000),intervals=frames.slice(1).map((f,i)=>f[0]-frames[i][0]).sort((a,b)=>a-b);
      return {kind,bootMs:window.profile.firstFrame-mark,framesDeliveredPerSecond:(frames.length-1)*1000/(frames.at(-1)[0]-frames[0][0]),frameIntervalP95:intervals[Math.floor(intervals.length*.95)],frameIntervalMax:intervals.at(-1),drawMs:frames.reduce((sum,f)=>sum+f[1],0)/frames.length,longTasks:window.profile.long,emulator:window.harnessStats,rom:kind==='restart'?{transferBytes:0,reusedVerifiedContent:true}:rom[0],bufferSources:window.bufferSources};
    },{kind,mark,rom});
    console.log(JSON.stringify(result));
    assert.equal(result.bufferSources,0,'audio streams continuously instead of allocating per-frame source nodes');
    assert.ok(result.emulator.audio.renderedSamples>100000);assert.ok(result.emulator.audio.queueMs<=100);
    assert.equal(result.emulator.audio.underruns,0,'steady playback must not exhaust its audio buffer');
    assert.equal(result.emulator.audio.overruns,0,'audio device startup must not accumulate stale PCM');
    runs.push(result);
    if(kind==='cold'){
      // PCM takes a direct worker-to-worklet port, bypassing a blocked UI thread.
      const before=await page.evaluate(()=>window.harnessStats);
      await page.evaluate(()=>{const until=performance.now()+250;while(performance.now()<until){/* deliberate UI stall */}});
      await page.waitForFunction(previous=>window.harnessStats.audio.renderedSamples>previous.audio.renderedSamples+60000,before,{timeout:10000});
      const after=await page.evaluate(()=>window.harnessStats);
      assert.equal(after.audio.underruns,before.audio.underruns,'UI stall must not interrupt audio');
      assert.ok(after.frames>before.frames+60,'emulator continues independently of UI');
      assert.ok(after.skippedVideo>before.skippedVideo,'video pool bounds queued images during UI stalls');
      assert.ok(after.audio.peak>0,'real emulator PCM reaches the audio processor');
      console.log(JSON.stringify({uiStallMs:250,audioBefore:before.audio,audioAfter:after.audio,skippedVideo:after.skippedVideo}));
      await page.evaluate(()=>window.testAudio[0].suspend());
      await page.waitForTimeout(300);
      await page.evaluate(()=>window.testAudio[0].resume());
      await page.waitForFunction(previous=>window.harnessStats.audio.renderedSamples>previous,after.audio.renderedSamples+60000);
    }
    await end();assert.equal(await page.evaluate(()=>window.testAudio.at(-1).state),'closed');
  }
  assert.deepEqual(errors,[]);
  await writeFile(process.env.PROFILE_OUTPUT??'.local/performance-after.json',JSON.stringify({runs,errors},null,2));
  console.log('Passed: ROM worker/cache/restart, continuous audio and UI-stall isolation, bounded frames, suspend/resume and session teardown. No gameplay performed.');
}finally{await context.close();}
