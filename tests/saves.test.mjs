import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {openSaves,listSlots,addSlot,renameSlot,removeSlot,readSave,writeSave,slotKey} from '../apps/harness/saves.mjs';
const game='test-game';
async function database(t){globalThis.indexedDB=new IDBFactory();const db=await openSaves();t.after(()=>db.close());return db;}
test('fresh browser gets exactly one default slot even with concurrent initialization',async t=>{
  const db=await database(t);const [a,b]=await Promise.all([listSlots(db,game),listSlots(db,game)]);
  assert.equal(a.length,1);assert.equal(a[0].name,'My trainer');assert.equal(a[0].id,b[0].id);
  await assert.rejects(removeSlot(db,game,a[0].id),/at least one/);
});
test('legacy A and B saves migrate without changing their bytes or previous backups',async t=>{
  globalThis.indexedDB=new IDBFactory();
  const legacy=await new Promise((resolve,reject)=>{const r=indexedDB.open('quetzal-harness',1);r.onupgradeneeded=()=>r.result.createObjectStore('saves');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await writeSave(legacy,slotKey(game,'A'),new Uint8Array([1]));await writeSave(legacy,slotKey(game,'A'),new Uint8Array([2]));
  await writeSave(legacy,slotKey(game,'B'),new Uint8Array([3]));legacy.close();
  const db=await openSaves();t.after(()=>db.close());const slots=await listSlots(db,game);
  assert.deepEqual(slots.map(s=>s.id),['A','B']);
  assert.deepEqual((await readSave(db,slotKey(game,'A'))).bytes,new Uint8Array([2]));
  assert.deepEqual((await readSave(db,slotKey(game,'A')+':previous')).bytes,new Uint8Array([1]));
  assert.deepEqual((await readSave(db,slotKey(game,'B'))).bytes,new Uint8Array([3]));
});
test('rename preserves progress; deletion removes only that slot and its backup',async t=>{
  const db=await database(t),[initial]=await listSlots(db,game),added=await addSlot(db,game,'Friends');
  await writeSave(db,slotKey(game,added.id),new Uint8Array([7]));await writeSave(db,slotKey(game,added.id),new Uint8Array([8]));
  await renameSlot(db,game,added.id,'Weekend');assert.equal((await listSlots(db,game)).find(s=>s.id===added.id).name,'Weekend');
  assert.deepEqual((await readSave(db,slotKey(game,added.id))).bytes,new Uint8Array([8]));
  await removeSlot(db,game,added.id);assert.equal(await readSave(db,slotKey(game,added.id)),undefined);assert.equal(await readSave(db,slotKey(game,added.id)+':previous'),undefined);
  assert.equal((await listSlots(db,game))[0].id,initial.id);
  await assert.rejects(renameSlot(db,game,initial.id,'  '),/name/);
  await assert.rejects(renameSlot(db,game,added.id,'Deleted'),/removed/);
});
