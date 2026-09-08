import {AudioRing} from './audio-buffer.mjs';
class QuetzalAudio extends AudioWorkletProcessor {
  constructor(){
    super();this.ring=new AudioRing(sampleRate);this.nextReport=0;
    this.port.onmessage=({data:m})=>{
      if(m.type==='connect'){
        this.input?.close();this.input=m.port;this.readySent=false;
        this.input.onmessage=({data})=>this.ring.push(data);
      }else if(m.type==='reset')this.ring.reset();
    };
  }
  process(_inputs,outputs){
    // The device may take hundreds of milliseconds to begin pulling audio even
    // after AudioContext reports running. Start PCM delivery only once it does.
    if(this.input&&!this.readySent){this.input.postMessage({type:'ready'});this.readySent=true;}
    const [left,right]=outputs[0];if(left&&right)this.ring.render(left,right);
    if(currentTime>=this.nextReport){this.nextReport=currentTime+1;this.port.postMessage(this.ring.stats());}
    return true;
  }
}
registerProcessor('quetzal-audio',QuetzalAudio);
