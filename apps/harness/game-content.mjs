// Keep one verified ROM in a loader worker until this page is closed.
let loader,sequence=0;
const pending=new Map();
export function downloadGame(onProgress){
  if(!loader){
    loader=new Worker(new URL('./game-content-worker.mjs',import.meta.url),{type:'module'});
    loader.onmessage=({data:m})=>{
      const request=pending.get(m.id);if(!request)return;
      if(m.type==='progress'){request.onProgress?.(m.message);return;}
      pending.delete(m.id);
      if(m.type==='error')request.reject(Error(m.message));else request.resolve(m.rom);
    };
    loader.onerror=event=>{
      loader.terminate();loader=null;
      for(const request of pending.values())request.reject(Error(event.message||'Game loader stopped. Press Play to retry.'));
      pending.clear();
    };
  }
  return new Promise((resolve,reject)=>{
    const id=++sequence;pending.set(id,{resolve,reject,onProgress});loader.postMessage({id});
  });
}
