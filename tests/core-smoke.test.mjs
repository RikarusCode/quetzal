import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const coreURL=new URL('../apps/harness/core/gpsp.mjs',import.meta.url);
const romURL=new URL('../pokemon emerald/PokemonQuetzalEnglishAlpha8v4.gba',import.meta.url);
const available=existsSync(coreURL)&&existsSync(romURL);
test('compiled core boots the pinned ROM and isolates two consoles',{skip:!available},async()=>{
  const rom=readFileSync(romURL);
  assert.equal(createHash('sha256').update(rom).digest('hex'),'e9fc9cf506ad11db7642e7d65774e2bb0e5f174eb9aceda725cd961ab9aee070');
  const {default:createCore}=await import(coreURL.href);
  const cores=[];
  for(let n=0;n<2;n++){
    const c=await createCore({print:()=>{},printErr:()=>{}});
    c.FS.mkdir('/game');c.FS.writeFile('/game/test.gba',rom);
    assert.equal(c.ccall('host_load','number',['string'],['/game/test.gba']),1);
    assert.equal(c._host_has_network(),1);
    assert.equal(c._host_save_size(),131072);
    for(let f=0;f<240;f++)c._host_frame(0);
    assert.equal(c._host_frames(),240);
    assert.ok(new Set(c.HEAPU16.subarray(c._host_pixels()/2,c._host_pixels()/2+38400)).size>10,'Game renders multiple colors');
    assert.ok(c._host_audio_frames()>0,'Core supplies audio frames');
    cores.push(c);
  }
  assert.notEqual(cores[0].HEAPU8.buffer,cores[1].HEAPU8.buffer);
  const a=cores[0],b=cores[1],offset=a._host_save(),other=b._host_save();
  const before=b.HEAPU8[other];a.HEAPU8[offset]=before^255;
  assert.equal(b.HEAPU8[other],before,'Writing one save does not affect the other console');
  assert.equal(a._host_link_start(0),1);assert.equal(a._host_connected(1),1);
  assert.equal(b._host_link_start(1),1);
  a._host_link_stop();b._host_link_stop();
  // Lifecycle availability is not a Quetzal in-game multiplayer proof.
});
