import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIONS,DEFAULT_BINDINGS,rebind,validBindings,maskFor,exportBindings,importBindings} from '../apps/harness/controls.mjs';
import {defaultGamepadProfile,validGamepadProfile,rebindGamepad,exportGamepadProfile,importGamepadProfile,gamepadInputs,gamepadMask,createGamepadGate} from '../apps/harness/gamepad.mjs';
test('remapping an occupied key swaps bindings without losing an action',()=>{
  const original={...DEFAULT_BINDINGS},changed=rebind(DEFAULT_BINDINGS,'a',DEFAULT_BINDINGS.b);
  assert.equal(changed.a,original.b);assert.equal(changed.b,original.a);assert.ok(validBindings(changed));
  assert.deepEqual(DEFAULT_BINDINGS,original);
});
test('keybind export and import preserve remaps',()=>{
  const bindings=rebind(DEFAULT_BINDINGS,'a','KeyV');
  assert.deepEqual(importBindings(exportBindings(bindings)),bindings);
});
test('keybind import rejects malformed, unsupported, oversized and ambiguous files',()=>{
  for(const text of ['oops','null','[]','x'.repeat(16385),JSON.stringify({format:'quetzal-keybindings',version:2,bindings:DEFAULT_BINDINGS})])assert.throws(()=>importBindings(text));
  for(const bindings of [{...DEFAULT_BINDINGS,extra:'KeyV'},{...DEFAULT_BINDINGS,a:DEFAULT_BINDINGS.b},{...DEFAULT_BINDINGS,a:'Escape'},{}]){
    assert.throws(()=>importBindings(JSON.stringify({format:'quetzal-keybindings',version:1,bindings})));
  }
});
test('remapped simultaneous inputs generate the right GBA bits',()=>{
  const changed=rebind(DEFAULT_BINDINGS,'up','KeyI');
  assert.equal(maskFor(new Set(['KeyI',DEFAULT_BINDINGS.a]),changed),(1<<4)|(1<<8));
  assert.equal(maskFor(new Set([DEFAULT_BINDINGS.up]),changed),0);
  assert.equal(maskFor(new Set(),changed),0);
});
test('invalid or incomplete persisted bindings are rejected',()=>{
  for(const value of [null,{}, {...DEFAULT_BINDINGS,a:'Escape'}, {...DEFAULT_BINDINGS,a:DEFAULT_BINDINGS.b}])assert.equal(validBindings(value),false);
  assert.throws(()=>rebind(DEFAULT_BINDINGS,'a','F5'));
});

const pad=()=>({connected:true,buttons:Array.from({length:17},()=>({pressed:false,value:0})),axes:[0,0,0,0]});
test('standard controller buttons, analog movement, and simultaneous inputs produce GBA masks',()=>{
  const p=pad(),profile=defaultGamepadProfile();p.buttons[0]={pressed:true,value:1};p.axes[0]=-.8;p.axes[1]=-.8;
  assert.equal(gamepadMask(gamepadInputs(p),profile,ACTIONS),(1<<8)|(1<<6)|(1<<4));
  p.axes=[0,0,0,0];p.buttons[0]={pressed:false,value:0};p.buttons[13]={pressed:true,value:1};p.buttons[5]={pressed:true,value:1};
  assert.equal(gamepadMask(gamepadInputs(p),profile,ACTIONS),(1<<5)|(1<<11));
  p.connected=false;assert.equal(gamepadMask(gamepadInputs(p),profile,ACTIONS),0);
  assert.equal(gamepadMask(gamepadInputs({...p,connected:true}),defaultGamepadProfile(false),ACTIONS),0);
});
test('stick deadzone and hysteresis reject drift and prevent threshold chatter',()=>{
  const p=pad();p.axes[0]=.29;assert.equal(gamepadInputs(p).size,0);
  p.axes[0]=.31;const pressed=gamepadInputs(p);assert.ok(pressed.has('a0+'));
  p.axes[0]=.28;assert.ok(gamepadInputs(p,.3,pressed).has('a0+'));
  p.axes[0]=.2;assert.equal(gamepadInputs(p,.3,pressed).size,0);
  p.axes[0]=NaN;assert.equal(gamepadInputs(p).size,0);
});
test('controller remaps swap occupied inputs and avoid overlapping left-stick assignments',()=>{
  const original=defaultGamepadProfile(),changed=rebindGamepad(original,'a','b1');
  assert.equal(changed.bindings.b,'b0');assert.equal(changed.bindings.a,'b1');assert.equal(original.bindings.a,'b0');
  const stick=rebindGamepad(changed,'a','a0+');assert.equal(stick.leftStick,false);assert.ok(validGamepadProfile(stick));
  const custom=rebindGamepad(defaultGamepadProfile(false),'up','a5-');assert.ok(validGamepadProfile(custom));
  assert.equal(custom.bindings.down,null);
});
test('controller settings round trip independently and reject malformed or unsafe imports',()=>{
  const profile={...rebindGamepad(defaultGamepadProfile(),'a','b6'),deadzone:.45};
  assert.deepEqual(importGamepadProfile(exportGamepadProfile(profile)),profile);
  for(const text of ['bad','null',exportBindings(DEFAULT_BINDINGS),'x'.repeat(16385),JSON.stringify({format:'quetzal-controller',version:2,profile})])assert.throws(()=>importGamepadProfile(text));
  for(const changed of [{...profile,deadzone:0},{...profile,deadzone:1},{...profile,deadzone:'0.3'},{...profile,leftStick:1},{...profile,bindings:{...profile.bindings,a:'b32'}},{...profile,bindings:{...profile.bindings,a:'a16+'}},{...profile,bindings:{...profile.bindings,a:'b1'}},{...profile,bindings:{...profile.bindings,a:'a0+'}},{...profile,bindings:{a:'b0'}}]){
    assert.equal(validGamepadProfile(changed),false);
    assert.throws(()=>importGamepadProfile(JSON.stringify({format:'quetzal-controller',version:1,profile:changed})));
  }
});
test('controller gate releases on focus loss and requires neutral before resuming',()=>{
  const gate=createGamepadGate();assert.equal(gate.read(256,true),0);
  assert.equal(gate.read(0,true),0);assert.equal(gate.read(256,true),256);
  assert.equal(gate.read(256,false),0);assert.equal(gate.read(256,true),0);
  gate.read(0,true);assert.equal(gate.read(256,true),256);
  gate.reset();assert.equal(gate.read(256,true),0);
});
