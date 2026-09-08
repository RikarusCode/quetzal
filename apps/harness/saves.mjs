export async function openSaves() {
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open('quetzal-harness',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('saves');
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
}
export async function readSave(db,key) {
  return new Promise((resolve,reject)=>{
    const r=db.transaction('saves').objectStore('saves').get(key);
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
}
export async function writeSave(db,key,bytes) {
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('saves','readwrite'),store=tx.objectStore('saves');
    const read=store.get(key);
    read.onsuccess=()=>{
      const old=read.result;
      if(old?.digest===digest) return;
      if(old) store.put(old,key+':previous');
      store.put({bytes,digest,at:Date.now()},key);
    };
    tx.oncomplete=()=>resolve(digest);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('Save aborted'));
  });
}
