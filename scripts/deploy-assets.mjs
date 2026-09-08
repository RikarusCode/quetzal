import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {BUILD_ID,ROM_SHA256} from '../apps/harness/relay-protocol.mjs';

export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=path=>Buffer.from(readFileSync(path,'utf8').replace(/\r\n/g,'\n'));
export function verifyArtifact(bytes,expected,label){
  if(bytes.length!==expected.size||digest(bytes)!==expected.sha256)throw Error(`Deployment artifact mismatch: ${label}`);
}
export async function fetchDeployAssets(out){
  const lock=JSON.parse(readFileSync('deployment/assets-lock.json','utf8'));
  if(lock.build!==BUILD_ID)throw Error('Deployment artifacts do not match the current emulator build.');
  for(const [path,expected] of Object.entries(lock.sources))verifyArtifact(sourceBytes(path),expected,path);
  const results=await Promise.allSettled(Object.entries(lock.files).map(async([path,expected])=>{
    if(!/^[a-zA-Z0-9_./-]+$/.test(path)||path.startsWith('/')||path.split('/').includes('..'))throw Error('Invalid artifact path.');
    const url=new URL(`${lock.build}/${path}`,lock.origin);
    const response=await fetch(url,{signal:AbortSignal.timeout(90000)});
    if(!response.ok)throw Error(`Artifact download failed (${response.status}): ${path}`);
    const bytes=Buffer.from(await response.arrayBuffer());verifyArtifact(bytes,expected,path);
    mkdirSync(dirname(resolve(out,path)),{recursive:true});writeFileSync(resolve(out,path),bytes);
  }));
  const failed=results.filter(result=>result.status==='rejected');
  if(failed.length)throw new AggregateError(failed.map(result=>result.reason),'Deployment artifacts could not be verified.');
}

// Operator-only: package the pinned binary inputs once, outside GitHub.
if(process.argv.includes('--package')){
  const files=['core/gpsp.mjs','core/gpsp.wasm','core/COPYING','core/build.json',`game/quetzal-${ROM_SHA256.slice(0,16)}.gba.gz`,'source/gpsp-source.tar.gz','source/host.c','source/build-emulator.mjs','source/BUILD.md','source/README.txt'];
  const lock={build:BUILD_ID,origin:'https://quetzal-assets.rikcroy.workers.dev/',sources:{},files:{}};
  for(const path of ['packages/emulator/host.c','scripts/build-emulator.mjs']){
    const bytes=sourceBytes(path);lock.sources[path]={size:bytes.length,sha256:digest(bytes)};
  }
  for(const path of files){
    const source=resolve('dist/site',path),bytes=readFileSync(source),target=resolve('dist/deploy-assets',BUILD_ID,path);
    lock.files[path]={size:bytes.length,sha256:digest(bytes)};
    mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);
  }
  mkdirSync('deployment',{recursive:true});writeFileSync('deployment/assets-lock.json',JSON.stringify(lock,null,2)+'\n');
  writeFileSync('dist/deploy-assets/_headers','/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex\n');
  console.log(`Packaged ${files.length} Cloudflare-hosted build inputs. Git contains only their hashes and URLs.`);
}
