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
  const cores=[],packets=[[],[]];
  for(let n=0;n<2;n++){
    const c=await createCore({print:()=>{},printErr:()=>{},onPacket:(flags,bytes,to)=>packets[n].push({flags,bytes,to})});
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
  // Exercise the serial hardware path Quetzal uses, not just a packet echo.
  assert.equal(a._host_serial_mode(),3,'Pinned harness uses Pokémon Gen3 link-cable mode');
  assert.equal(b._host_serial_mode(),3);
  const ioA=a._host_io_registers()/2,ioB=b._host_io_registers()/2;
  a.HEAPU16[ioA+0x9a]=0;b.HEAPU16[ioB+0x9a]=0; // RCNT: normal serial operation
  a.HEAPU16[ioA+0x95]=0xb9a0;b.HEAPU16[ioB+0x95]=0xb9a0;
  b._write_siocnt(0x6003); // child uses external clock, IRQ enabled
  a._write_siocnt(0x6083); // parent initiates a multiplayer serial transfer
  assert.equal(packets[0].length,1,'Host emits the first handshake packet');
  const handshake=packets[0][0];
  assert.equal(handshake.to,65535);assert.equal(handshake.bytes.length,24);
  assert.deepEqual(Array.from(handshake.bytes.subarray(0,4)),[0x4d,0x50,0x4b,0x31]);
  function deliver(c,p,from){const ptr=c._malloc(p.bytes.length);c.HEAPU8.set(p.bytes,ptr);c._host_receive(ptr,p.bytes.length,from);c._free(ptr);}
  deliver(b,handshake,0);b._update_serial(280065);
  assert.equal(packets[1].length,1,'Child responds to the host handshake');
  deliver(a,packets[1][0],1);a._update_serial(10000);
  a._write_siocnt(0x6083);
  assert.equal(a.HEAPU16[ioA+0x91],0xb9a0,'Host sees the child handshake in SIOMULTI1');
  a._update_serial(10000);a.HEAPU16[ioA+0x95]=0x8fff;a._write_siocnt(0x6083);
  assert.equal(new DataView(packets[0].at(-1).bytes.buffer).getUint32(4),2,'Serial protocol enters connected state');
  for(let f=0;f<60;f++){a._host_frame(0);b._host_frame(0);}
  assert.equal(a._host_frames(),300,'Host continues producing frames after handshake');
  a._host_link_stop();b._host_link_stop();
  // Lifecycle availability is not a Quetzal in-game multiplayer proof.
});
