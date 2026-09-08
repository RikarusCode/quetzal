import {createGameLoader} from './game-loader.mjs';
const load=createGameLoader();
onmessage=async({data:{id}})=>{
  try{
    const verified=await load(message=>postMessage({id,type:'progress',message}));
    const rom=verified.slice().buffer;
    postMessage({id,type:'loaded',rom},[rom]);
  }catch(error){postMessage({id,type:'error',message:error.message});}
};
