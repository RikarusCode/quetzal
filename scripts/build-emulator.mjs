import { readFileSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root=process.cwd(), core=resolve('.local/src/gpsp'), sdk=resolve('.local/tools/emsdk');
const sha=execFileSync('git',['-C',core,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(sha!=='8d268a6bb2cd799f8f2791ebb544a7ef550cfc6f') throw Error('Unexpected gpSP revision');
const python=resolve(sdk,'python/3.13.3_64bit/python.exe');
const emcc=resolve(sdk,'upstream/emscripten/emcc.py');
const build=resolve('build/emulator'); mkdirSync(build,{recursive:true});
const flags=['-O3','-D__LIBRETRO__','-DINLINE=inline','-DHAVE_STRINGS_H','-DHAVE_STDINT_H','-DHAVE_INTTYPES_H',
  '-DFRONTEND_SUPPORTS_RGB565','-DGIT_VERSION="8d268a6"','-Ilibretro','-Ilibretro/libretro-common/include','-I.'];
const make=readFileSync(resolve(core,'Makefile.common'),'utf8').split('ifeq')[0];
const files=[...make.matchAll(/\$\((CORE_DIR|LIBRETRO_COMM_DIR)\)\/([\w/.-]+\.(?:c|cc|S))\b/g)]
  .map(m=>(m[1]==='CORE_DIR'?'':'libretro/libretro-common/')+m[2]);
// WASM assembler does not support the native .incbin wrapper. Embed the same open BIOS.
const bios=readFileSync(resolve(core,'bios/open_gba_bios.bin'));
const biosC=resolve(build,'bios.c');
writeFileSync(biosC,`const unsigned char open_gba_bios_rom[${bios.length}]={${Array.from(bios).join(',')}};\n`);
const sources=[...files.filter(x=>!x.endsWith('.S')),biosC,resolve('packages/emulator/host.c')];
const objects=[];
for(let i=0;i<sources.length;i++) {
  const src=sources[i], obj=resolve(build,`${i}.o`); objects.push(obj);
  if(process.argv.includes('--link-only')) continue;
  console.log(`Compile ${src}`);
  execFileSync(python,[emcc,...flags,...(src.endsWith('.cc')?['-std=c++11','-fno-exceptions','-fno-rtti']:[]),'-c',src,'-o',obj],
    {cwd:core,stdio:'inherit',env:{...process.env,EM_CONFIG:resolve(sdk,'.emscripten')}});
}
const out=resolve('apps/harness/core');mkdirSync(out,{recursive:true});
execFileSync(python,[emcc,...objects,'-O3','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node',
  '-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=134217728','-sSTACK_SIZE=1048576','-sFORCE_FILESYSTEM=1',
  // Exercise the actual serial controller and packet path without gameplay automation.
  '-sEXPORTED_RUNTIME_METHODS=FS,ccall,HEAPU8,HEAPU16,HEAP16','-sEXPORTED_FUNCTIONS=_malloc,_free,_write_siocnt,_update_serial',
  '-o',resolve(out,'gpsp.mjs')],{cwd:core,stdio:'inherit',env:{...process.env,EM_CONFIG:resolve(sdk,'.emscripten')}});
copyFileSync(resolve(core,'COPYING'),resolve(out,'COPYING'));
writeFileSync(resolve(out,'build.json'),JSON.stringify({core:'gpSP',commit:sha,emscripten:'6.0.9',dynarec:false,bios:'builtin',serial:'mul_poke'},null,2)+'\n');
console.log('Built apps/harness/core/gpsp.mjs and gpsp.wasm');
