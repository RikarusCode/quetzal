import {defaultGamepadProfile,validGamepadProfile,rebindGamepad,exportGamepadProfile,importGamepadProfile,gamepadInputs,gamepadMask,gamepadInputLabel,createGamepadGate} from './gamepad.mjs';

export function setupGamepadControls({actions,dialog,isEnabled,onMask}){
  const $=id=>document.getElementById(id),storageKey='quetzal.controllers.v1',gate=createGamepadGate();
  let profiles={},profile=defaultGamepadProfile(),profileKey='standard',selected=null,pad=null,roster='',capture=null;
  let previous=new Set(),capturePrevious=new Set(),raf=0,timer=0,unavailable=false;
  try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved&&typeof saved==='object'&&!Array.isArray(saved))for(const [key,value] of Object.entries(saved).slice(0,32))if(validGamepadProfile(value))Object.defineProperty(profiles,key,{value,writable:true,enumerable:true,configurable:true});}catch{}
  const status=message=>{$('controller-status').textContent=message;};
  function reset(){gate.reset();previous.clear();onMask(0);}
  function cancel(){capture=null;capturePrevious.clear();render();}
  function persist(message){
    Object.defineProperty(profiles,profileKey,{value:profile,writable:true,enumerable:true,configurable:true});
    try{localStorage.setItem(storageKey,JSON.stringify(profiles));status(message);}catch{status('Updated for this tab. Browser storage is unavailable.');}
  }
  function render(){
    $('controller-bindings').replaceChildren(...actions.map(([id,label])=>{
      const row=document.createElement('div');row.className='binding-row';
      const text=document.createElement('span');text.textContent=label;
      const button=document.createElement('button');button.type='button';button.dataset.gamepadAction=id;
      const name=gamepadInputLabel(profile.bindings[id],pad?.mapping==='standard'||profileKey==='standard');
      button.textContent=capture===id?'Press input…':name;button.disabled=!pad;
      button.classList.toggle('capturing',capture===id);button.setAttribute('aria-label',`Change controller ${label}, currently ${name}`);
      button.onclick=()=>{reset();capture=id;capturePrevious=gamepadInputs(pad,.65);render();status(`Release, then press a button or move a stick for ${label}. Escape cancels.`);$('controller-bindings').querySelector(`[data-gamepad-action="${id}"]`).focus();};
      row.append(text,button);return row;
    }));
    $('controller-deadzone').value=String(Math.round(profile.deadzone*100));$('deadzone-value').value=`${Math.round(profile.deadzone*100)}%`;
    $('controller-stick').checked=profile.leftStick;
    $('controller-stick').disabled=Object.values(profile.bindings).some(token=>/^a[01][+-]$/.test(token??''));
    $('controller-stick').title=$('controller-stick').disabled?'The left stick is assigned to a control above. Remap it to enable movement here.':'';
  }
  function select(next){
    reset();capture=null;pad=next;selected=pad?.index??null;
    profileKey=pad&&pad.mapping!=='standard'?`device:${pad.id}`:'standard';
    profile=profiles[profileKey]??defaultGamepadProfile(profileKey==='standard');
    $('controller-device').value=selected===null?'':String(selected);render();
    status(!pad?'Connect a controller, then press a button.':pad.mapping==='standard'?'Connected. Click the game to play.':'Custom layout. Map the controls below, then click the game.');
  }
  function poll(){
    raf=0;timer=0;if(document.hidden)return;
    let pads=[];
    try{pads=Array.from(navigator.getGamepads()).filter(p=>p?.connected);}catch{unavailable=true;}
    if(unavailable){reset();pad=null;capture=null;render();$('controller-device').disabled=true;$('controller-connection').textContent='Controller access is unavailable in this browser.';return;}
    const nextRoster=JSON.stringify(pads.map(p=>[p.index,p.id,p.mapping]));
    if(nextRoster!==roster){
      roster=nextRoster;
      $('controller-device').replaceChildren(...(pads.length?pads.map(p=>{const option=document.createElement('option');option.value=String(p.index);option.textContent=`${p.index+1}: ${p.id}`;return option;}):[new Option('No controller detected','')]));
      $('controller-device').disabled=!pads.length;
      const retained=pads.find(p=>p.index===selected&&p.id===pad?.id&&p.mapping===pad?.mapping);
      if(!retained)select(pads[0]??null);else $('controller-device').value=String(selected);
      $('controller-connection').textContent=pads.length?'One controller controls this trainer.':'Connect by USB or Bluetooth, then press a controller button.';
    }
    pad=pads.find(p=>p.index===selected)??null;
    if(pad){
      const inputs=gamepadInputs(pad,profile.deadzone,previous);previous=inputs;
      if(capture&&dialog.open&&!$('controller-panel').hidden&&document.hasFocus()){
        const current=gamepadInputs(pad,.65),pressed=[...current].find(token=>!capturePrevious.has(token));capturePrevious=current;
        if(pressed){const action=capture;profile=rebindGamepad(profile,action,pressed);capture=null;reset();render();persist('Controller binding saved.');$('controller-bindings').querySelector(`[data-gamepad-action="${action}"]`).focus();}
      }
      onMask(gate.read(gamepadMask(inputs,profile,actions),isEnabled()));
    }else reset();
    // Controller sampling never drives emulator frames or link execution.
    if(pads.length)raf=requestAnimationFrame(poll);else timer=setTimeout(poll,500);
  }
  function wake(){cancelAnimationFrame(raf);clearTimeout(timer);poll();}
  $('controller-device').onchange=()=>{try{const pads=Array.from(navigator.getGamepads());select(pads.find(p=>p?.connected&&p.index===Number($('controller-device').value))??null);}catch{unavailable=true;wake();}};
  $('controller-deadzone').oninput=()=>{reset();capture=null;profile={...profile,deadzone:Number($('controller-deadzone').value)/100};render();persist('Deadzone saved.');};
  $('controller-stick').onchange=()=>{reset();capture=null;profile={...profile,leftStick:$('controller-stick').checked};render();persist('Stick setting saved.');};
  $('reset-controller').onclick=()=>{reset();capture=null;profile=defaultGamepadProfile(profileKey==='standard');render();persist('Controller defaults restored.');};
  $('export-controller').onclick=()=>{
    cancel();const url=URL.createObjectURL(new Blob([exportGamepadProfile(profile)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='quetzal-controller.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Controller settings exported.');
  };
  $('import-controller-button').onclick=()=>{cancel();$('import-controller').click();};
  $('import-controller').onchange=async()=>{
    const key=profileKey;
    try{const file=$('import-controller').files[0];if(!file)return;if(file.size>16384)throw Error('Controller files must be smaller than 16 KiB.');
      const next=importGamepadProfile(await file.text());if(key!==profileKey)throw Error('Controller changed. Select the intended controller and import again.');
      reset();capture=null;profile=next;render();persist('Controller settings imported and saved.');
    }catch(error){status(error.message);}finally{$('import-controller').value='';}
  };
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'&&capture){event.preventDefault();event.stopPropagation();cancel();status('Binding change canceled.');}});
  dialog.addEventListener('close',()=>{cancel();reset();});
  window.addEventListener('gamepadconnected',wake);window.addEventListener('gamepaddisconnected',()=>{reset();wake();});
  window.addEventListener('blur',reset);
  document.addEventListener('visibilitychange',()=>{reset();wake();});
  profile=profiles.standard??profile;render();
  if(typeof navigator.getGamepads!=='function'){unavailable=true;$('controller-connection').textContent='Controllers are not supported by this browser.';}else wake();
  return {reset,cancel};
}
