// Fixed storage, stereo PCM, and continuous resampling at the audio device rate.
export class AudioRing {
  constructor(outputRate,inputRate=32768){
    this.inputRate=inputRate;this.step=inputRate/outputRate;
    this.target=Math.ceil(inputRate*.04);this.limit=Math.ceil(inputRate*.1);
    this.samples=new Int16Array((this.limit+1)*2);this.capacity=this.samples.length/2;
    this.read=0;this.write=0;this.count=0;this.phase=0;this.started=false;
    this.underruns=0;this.overruns=0;this.received=0;this.rendered=0;this.peak=0;this.lastL=0;this.lastR=0;this.fade=0;
  }
  reset(){this.read=this.write=this.count=this.phase=0;this.started=false;this.fade=0;}
  push(pcm){
    if(!(pcm instanceof Int16Array)||pcm.length%2)return;
    this.received+=pcm.length/2;
    // Discard stale audio after suspension instead of accumulating audible lag.
    if(this.count+pcm.length/2>this.limit){this.reset();this.overruns++;}
    const start=Math.max(0,pcm.length-this.limit*2);
    for(let i=start;i<pcm.length;i+=2){
      this.samples[this.write*2]=pcm[i];this.samples[this.write*2+1]=pcm[i+1];
      this.write=(this.write+1)%this.capacity;this.count++;
    }
  }
  render(left,right){
    if(!this.started&&this.count>=this.target){this.started=true;this.fade=0;}
    for(let i=0;i<left.length;i++){
      if(this.started&&this.count<Math.max(2,Math.ceil(this.phase+this.step))){
        this.started=false;this.phase=0;this.underruns++;
      }
      if(this.started){
        const a=this.read*2,b=((this.read+1)%this.capacity)*2;
        this.fade=Math.min(1,this.fade+1/64);
        this.lastL=(this.samples[a]+(this.samples[b]-this.samples[a])*this.phase)/32768*this.fade;
        this.lastR=(this.samples[a+1]+(this.samples[b+1]-this.samples[a+1])*this.phase)/32768*this.fade;
        this.phase+=this.step;const used=Math.floor(this.phase);this.phase-=used;
        this.read=(this.read+used)%this.capacity;this.count-=used;this.rendered++;
        this.peak=Math.max(this.peak,Math.abs(this.lastL),Math.abs(this.lastR));
      }else{this.lastL*=.95;this.lastR*=.95;}
      left[i]=this.lastL;right[i]=this.lastR;
    }
  }
  stats(){return {queueMs:Math.round(this.count/this.inputRate*1000),underruns:this.underruns,overruns:this.overruns,receivedFrames:this.received,renderedSamples:this.rendered,peak:this.peak};}
}
