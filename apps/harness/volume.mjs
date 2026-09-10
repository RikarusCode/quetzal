export function setupVolume({isPlaying,onError,send,onStats=()=>{}}){
  const $=id=>document.getElementById(id),button=$('sound'),panel=$('volume-popover'),slider=$('volume');
  let context,gain,node,starting,connected=false,value=50,lastAudible=50;
  try{const stored=localStorage.getItem('quetzal.volume');if(stored!==null&&Number.isFinite(Number(stored)))value=Math.max(0,Math.min(100,Number(stored)));}catch{}
  if(value)lastAudible=value;
  function render(){
    slider.value=String(value);$('volume-value').value=`${value}%`;slider.setAttribute('aria-valuetext',value?`${value}%`:'Muted');
    $('mute').setAttribute('aria-pressed',String(value===0));$('mute').setAttribute('aria-label',value===0?'Unmute':'Mute');$('mute').title=value===0?'Unmute':'Mute';
    $('volume-symbol').setAttribute('d',value===0?'m16 9 5 6m0-6-5 6':'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14');
    button.setAttribute('aria-label',value?`Volume: ${value}%`:'Volume: muted');
  }
  function setVolume(next){
    value=Math.max(0,Math.min(100,Number(next)||0));if(value)lastAudible=value;
    if(context&&gain){gain.gain.cancelScheduledValues(context.currentTime);gain.gain.setTargetAtTime(value/100,context.currentTime,.015);}
    try{localStorage.setItem('quetzal.volume',String(value));}catch{}render();
  }
  async function activate(){
    if(!context){
      const current=context=new AudioContext({latencyHint:'interactive'});
      gain=current.createGain();gain.gain.value=value/100;gain.connect(current.destination);
      current.onstatechange=()=>{if(context===current){node?.port.postMessage({type:'reset'});send({type:'audio-active',active:current.state==='running'});}};
      starting=(async()=>{
        await current.audioWorklet.addModule(new URL('./audio-worklet.mjs',import.meta.url));
        if(context!==current)return;
        node=new AudioWorkletNode(current,'quetzal-audio',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
        node.connect(gain);node.port.onmessage=({data})=>{if(context===current)onStats({...data,outputRate:current.sampleRate,baseLatencyMs:Math.round(current.baseLatency*1000)});};
        node.onprocessorerror=()=>{if(context===current){send({type:'audio-active',active:false});onError(Error('Audio processor stopped. End the session and try again.'));}};
        connect();
      })();
    }
    // Resume inside the interaction, before awaiting module initialization.
    const current=context,resumed=current.state!=='running'?current.resume():Promise.resolve();
    try{await Promise.all([starting,resumed]);}
    catch(error){if(context!==current)return;await stop();throw error;}
  }
  function connect(){
    // Play unlocks audio immediately; transfer the port only once a game exists.
    if(connected||!node||!isPlaying())return;
    const channel=new MessageChannel();node.port.postMessage({type:'connect',port:channel.port1},[channel.port1]);
    send({type:'audio-connect',port:channel.port2,active:context.state==='running'},[channel.port2]);connected=true;
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
  async function stop(){
    close();send({type:'audio-disconnect'});const previous=context;context=null;starting=null;connected=false;
    node?.disconnect();node?.port.close();node=null;gain=null;onStats(null);
    if(previous&&previous.state!=='closed')await previous.close();
  }
  return {start:()=>activate().catch(onError),connect,stop};
}
