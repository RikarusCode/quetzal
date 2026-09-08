import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_BINDINGS,rebind,validBindings,maskFor} from '../apps/harness/controls.mjs';
test('remapping an occupied key swaps bindings without losing an action',()=>{
  const changed=rebind(DEFAULT_BINDINGS,'a','KeyZ');
  assert.equal(changed.a,'KeyZ');assert.equal(changed.b,'KeyX');assert.ok(validBindings(changed));
  assert.equal(DEFAULT_BINDINGS.a,'KeyX');
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
