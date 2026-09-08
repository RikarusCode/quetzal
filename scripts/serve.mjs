import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import {BUILD_ID,ROM_SHA256,ROM_SIZE} from '../apps/harness/relay-protocol.mjs';
const root=resolve('apps/harness');
const localFixture=process.argv.includes('--local-fixture');
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'};
createServer(async(req,res)=>{
  try {
    if(req.method!=='GET') {res.writeHead(405);return res.end();}
    const url=new URL(req.url,'http://localhost'), name=decodeURIComponent(url.pathname);
    if(name==='/game-manifest.json'&&localFixture){
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      return res.end(JSON.stringify({build:BUILD_ID,url:'/__test/rom',encoding:'raw',size:ROM_SIZE,sha256:ROM_SHA256}));
    }
    // Opt-in loopback-only test fixture. Never enabled by npm start or production builds.
    if(name==='/__test/rom' && localFixture){
      const data=await readFile(resolve('pokemon emerald/PokemonQuetzalEnglishAlpha8v4.gba'));
      res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'no-store'});return res.end(data);
    }
    const path=resolve(root,'.'+(name==='/'?'/index.html':name));
    if(!path.startsWith(root+sep)) {res.writeHead(403);return res.end();}
    // Serve only the harness, never the repository or local ROM directory.
    const data=await readFile(path);
    res.writeHead(200,{'Content-Type':mime[extname(path)]??'application/octet-stream','Cache-Control':'no-store',
      'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});
    res.end(data);
  }catch {res.writeHead(404);res.end('Not found');}
}).listen(4173,'127.0.0.1',()=>console.log('Quetzal harness: http://127.0.0.1:4173'));
