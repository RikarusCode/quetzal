import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_BINDINGS,rebind,validBindings,maskFor,exportBindings,importBindings} from '../apps/harness/controls.mjs';
test('remapping an occupied key swaps bindings without losing an action',()=>{
  const changed=rebind(DEFAULT_BINDINGS,'a','KeyZ');
  assert.equal(changed.a,'KeyZ');assert.equal(changed.b,'KeyX');assert.ok(validBindings(changed));
  assert.equal(DEFAULT_BINDINGS.a,'KeyX');
});
test('keybind export and import preserve remaps',()=>{
  const bindings=rebind(DEFAULT_BINDINGS,'a','KeyV');
  assert.deepEqual(importBindings(exportBindings(bindings)),bindings);
});
test('keybind import rejects malformed, unsupported, oversized and ambiguous files',()=>{
  for(const text of ['oops','null','[]','x'.repeat(16385),JSON.stringify({format:'quetzal-keybindings',version:2,bindings:DEFAULT_BINDINGS})])assert.throws(()=>importBindings(text));
  for(const bindings of [{...DEFAULT_BINDINGS,extra:'KeyV'},{...DEFAULT_BINDINGS,a:'KeyZ'},{...DEFAULT_BINDINGS,a:'Escape'},{}]){
    assert.throws(()=>importBindings(JSON.stringify({format:'quetzal-keybindings',version:1,bindings})));
  }
});
test('remapped simultaneous inputs generate the right GBA bits',()=>{
  const changed=rebind(DEFAULT_BINDINGS,'up','KeyW');
  assert.equal(maskFor(new Set(['KeyW','KeyX']),changed),(1<<4)|(1<<8));
  assert.equal(maskFor(new Set(['ArrowUp']),changed),0);
  assert.equal(maskFor(new Set(),changed),0);
});
test('invalid or incomplete persisted bindings are rejected',()=>{
  for(const value of [null,{}, {...DEFAULT_BINDINGS,a:'Escape'}, {...DEFAULT_BINDINGS,a:'KeyZ'}])assert.equal(validBindings(value),false);
  assert.throws(()=>rebind(DEFAULT_BINDINGS,'a','F5'));
});
