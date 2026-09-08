export function setupVolume({isPlaying,onError}){
  const $=id=>document.getElementById(id),button=$('sound'),panel=$('volume-popover'),slider=$('volume');
  let context,gain,nextAudio=0,value=50,lastAudible=50;
  try{const stored=localStorage.getItem('quetzal.volume');if(stored!==null&&Number.isFinite(Number(stored)))value=Math.max(0,Math.min(100,Number(stored)));}catch{}
  if(value)lastAudible=value;
  function render(){
    slider.value=String(value);$('volume-value').value=`${value}%`;slider.setAttribute('aria-valuetext',value?`${value}%`:'Muted');
    $('mute').setAttribute('aria-pressed',String(value===0));$('mute').setAttribute('aria-label',value===0?'Unmute':'Mute');$('mute').title=value===0?'Unmute':'Mute';
  }
  function setVolume(next){
    value=Math.max(0,Math.min(100,Number(next)||0));if(value)lastAudible=value;
    if(context&&gain){gain.gain.cancelScheduledValues(context.currentTime);gain.gain.setTargetAtTime(value/100,context.currentTime,.015);}
    try{localStorage.setItem('quetzal.volume',String(value));}catch{}render();
  }
  async function activate(){
    if(!isPlaying())return;
    if(!context){context=new AudioContext();gain=context.createGain();gain.gain.value=value/100;gain.connect(context.destination);nextAudio=0;}
    await context.resume();
  }
  const close=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');};
  button.onclick=()=>{
    if(!isPlaying())return;
    panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));
    if(!panel.hidden){activate().catch(onError);slider.focus();}
  };
  slider.oninput=()=>{setVolume(slider.value);activate().catch(onError);};
  $('mute').onclick=()=>{setVolume(value?0:lastAudible);activate().catch(onError);};
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.volume-control'))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){close();button.focus();}});
  document.addEventListener('fullscreenchange',close);
  render();
  return {
    play(pcm){
      if(!context||context.state!=='running'||!pcm.length||value===0)return;
      if(nextAudio>context.currentTime+.25)return;
      const buffer=context.createBuffer(2,pcm.length/2,32768);
      for(let ch=0;ch<2;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]=pcm[i*2+ch]/32768;}
      const source=context.createBufferSource();source.buffer=buffer;source.connect(gain);
      nextAudio=Math.max(nextAudio,context.currentTime+.025);source.start(nextAudio);nextAudio+=buffer.duration;
    },
    async stop(){close();const previous=context;context=null;gain=null;nextAudio=0;if(previous&&previous.state!=='closed')await previous.close();}
  };
}
