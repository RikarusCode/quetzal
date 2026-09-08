export async function openSaves() {
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open('quetzal-harness',2);
    r.onupgradeneeded=()=>{
      if(!r.result.objectStoreNames.contains('saves'))r.result.createObjectStore('saves');
      if(!r.result.objectStoreNames.contains('slots'))r.result.createObjectStore('slots');
    };
    r.onblocked=()=>reject(Error('Close other Quetzal tabs once so save storage can be updated.'));
    r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};r.onerror=()=>reject(r.error);
  });
}

const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('Storage operation aborted.'));});
export const slotKey=(game,id)=>`${game}:${id}`;
export function validSlotName(name){
  name=String(name??'').trim();
  if(!name||name.length>60)throw Error('Use a save-slot name between 1 and 60 characters.');
  return name;
}
export async function listSlots(db,game){
  // One transaction makes first-use migration safe when two tabs open together.
  const tx=db.transaction(['slots','saves'],'readwrite'),finished=done(tx),slots=tx.objectStore('slots');
  let result=[];
  const all=slots.getAll();all.onsuccess=()=>{
    result=all.result.filter(s=>s.game===game);
    if(result.length)return;
    const saved={};let remaining=2;
    for(const id of ['A','B']){
      const request=tx.objectStore('saves').get(slotKey(game,id));request.onsuccess=()=>{
        saved[id]=request.result;
        if(--remaining)return;
        for(const legacy of ['A','B'])if(saved[legacy]){
          const slot={id:legacy,game,name:`Trainer ${legacy}`,createdAt:Date.now()};slots.put(slot,slotKey(game,legacy));result.push(slot);
        }
        if(!result.length){const slot={id:crypto.randomUUID(),game,name:'My trainer',createdAt:Date.now()};slots.put(slot,slotKey(game,slot.id));result.push(slot);}
      };
    }
  };
  await finished;return result.sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
}
export async function addSlot(db,game,name){
  const slot={id:crypto.randomUUID(),game,name:validSlotName(name),createdAt:Date.now()};
  const tx=db.transaction('slots','readwrite'),finished=done(tx);tx.objectStore('slots').add(slot,slotKey(game,slot.id));await finished;return slot;
}
export async function renameSlot(db,game,id,name){
  name=validSlotName(name);const tx=db.transaction('slots','readwrite'),finished=done(tx),store=tx.objectStore('slots');
  const request=store.get(slotKey(game,id));let found=false;
  request.onsuccess=()=>{if(request.result){found=true;store.put({...request.result,name},slotKey(game,id));}};
  await finished;if(!found)throw Error('This save slot was removed in another tab.');
}
export async function removeSlot(db,game,id){
  const tx=db.transaction(['slots','saves'],'readwrite'),finished=done(tx),slots=tx.objectStore('slots');let error;
  const request=slots.getAll();request.onsuccess=()=>{
    const all=request.result.filter(s=>s.game===game);
    if(!all.some(s=>s.id===id)){error=Error('This slot has already been removed.');return;}
    if(all.length<=1){error=Error('Keep at least one save slot. Add another before removing this one.');return;}
    const key=slotKey(game,id);slots.delete(key);const saves=tx.objectStore('saves');saves.delete(key);saves.delete(key+':previous');
  };
  await finished;if(error)throw error;
}

// Hold this lock for an emulator's lifetime, or briefly for import/delete.
export async function lockSlot(game,id,locks=globalThis.navigator?.locks){
  if(!locks)throw Error('This browser cannot protect saves across tabs. Use a current Chrome, Edge, Firefox or Safari browser.');
  let unlock;
  const held=new Promise(resolve=>{unlock=resolve;});
  return new Promise((resolve,reject)=>{
    locks.request(`quetzal-save:${slotKey(game,id)}`,{ifAvailable:true},async lock=>{
      if(!lock){reject(Error('This save slot is open in another tab. Close that game or choose a different slot.'));return;}
      resolve(unlock);await held;
    }).catch(reject);
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
