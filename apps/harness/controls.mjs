export const ACTIONS=[['up','Up',4],['down','Down',5],['left','Left',6],['right','Right',7],['a','A · Confirm',8],['b','B · Cancel',0],['start','Start',3],['select','Select',2],['l','L shoulder',10],['r','R shoulder',11]];
export const DEFAULT_BINDINGS={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',a:'KeyX',b:'KeyZ',start:'Enter',select:'ShiftRight',l:'KeyA',r:'KeyS'};
const STORAGE_KEY='quetzal.keyboard.v1';
export function allowedKey(code){return /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Enter|Shift(Left|Right)|Backspace|Tab|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote|Numpad[0-9])$/.test(code);}
export function validBindings(value){return !!value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===ACTIONS.length && ACTIONS.every(([id])=>Object.hasOwn(value,id)&&typeof value[id]==='string'&&allowedKey(value[id])) && new Set(ACTIONS.map(([id])=>value[id])).size===ACTIONS.length;}
export function exportBindings(bindings){
  if(!validBindings(bindings))throw Error('Invalid keyboard bindings.');
  return JSON.stringify({format:'quetzal-keybindings',version:1,bindings},null,2)+'\n';
}
export function importBindings(text){
  if(text.length>16384)throw Error('Keybind files must be smaller than 16 KiB.');
  let data;try{data=JSON.parse(text);}catch{throw Error('Choose a valid keybind JSON file exported from Quetzal.');}
  if(data?.format!=='quetzal-keybindings'||data.version!==1)throw Error('Unsupported keybind file. Expected Quetzal keybindings version 1.');
  if(!validBindings(data.bindings))throw Error('The file must assign one supported, unique key to each of the ten controls.');
  return {...data.bindings};
}
export function rebind(bindings,action,code){
  if(!ACTIONS.some(([id])=>id===action)||!allowedKey(code))throw Error('Choose a letter, number, arrow, or another standard keyboard key.');
  const result={...bindings};const occupied=ACTIONS.find(([id])=>id!==action && bindings[id]===code);
  if(occupied)result[occupied[0]]=bindings[action];result[action]=code;return result;
}
export function keyLabel(code){return ({ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Space:'Space',ShiftLeft:'Left Shift',ShiftRight:'Right Shift',Minus:'−',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Backquote:'`'})[code]??code.replace(/^Key|^Digit/,'').replace('Numpad','Num ');}
export function maskFor(held,bindings){return ACTIONS.reduce((mask,[id,,bit])=>held.has(bindings[id])?mask|(1<<bit):mask,0);}
export function setupControls({screen,send,isLoaded}){
  const $=id=>document.getElementById(id),dialog=$('settings-dialog');let bindings={...DEFAULT_BINDINGS},capture=null;
  const held=new Set();
  try{const stored=JSON.parse(localStorage.getItem(STORAGE_KEY));if(validBindings(stored))bindings=stored;}catch{}
  const release=()=>{held.clear();send({type:'release-buttons'});};
  function render(){
    $('binding-list').replaceChildren(...ACTIONS.map(([id,label])=>{
      const row=document.createElement('div');row.className='binding-row';const text=document.createElement('span');text.textContent=label;
      const button=document.createElement('button');button.type='button';button.dataset.action=id;
      button.textContent=capture===id?'Press a key…':keyLabel(bindings[id]);button.classList.toggle('capturing',capture===id);
      button.setAttribute('aria-label',`Change ${label} binding, currently ${keyLabel(bindings[id])}`);
      button.onclick=()=>{release();capture=id;render();$('binding-status').textContent=`Press a key for ${label}, or Escape to cancel.`;dialog.querySelector(`[data-action="${id}"]`).focus();};
      row.append(text,button);return row;
    }));
    $('controls-summary').replaceChildren(...[['Move',['up','left','down','right']],['A',['a']],['B',['b']],['Start',['start']]].map(([label,ids])=>{
      const span=document.createElement('span');span.append(label+' ');for(const id of ids){const key=document.createElement('kbd');key.textContent=keyLabel(bindings[id]);span.append(key,' ');}return span;
    }));
  }
  function persist(message){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(bindings));$('binding-status').textContent=message;}catch{$('binding-status').textContent='Bindings updated for this tab. Browser storage is unavailable, so changes will not survive refresh.';}}
  function open(){release();capture=null;render();$('binding-status').textContent='Saved automatically.';dialog.showModal();}
  $('settings').onclick=open;
  for(const id of ['close-settings','done-settings'])$(id).onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{capture=null;release();render();if(isLoaded())screen.focus();});
  dialog.addEventListener('cancel',e=>{if(capture){e.preventDefault();capture=null;render();$('binding-status').textContent='Binding change canceled.';}});
  $('reset-controls').onclick=()=>{release();capture=null;bindings={...DEFAULT_BINDINGS};render();persist('Default controls restored.');};
  $('export-controls').onclick=()=>{
    capture=null;release();render();const url=URL.createObjectURL(new Blob([exportBindings(bindings)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='quetzal-keybindings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('binding-status').textContent='Keybindings exported.';
  };
  $('import-controls-button').onclick=()=>{capture=null;release();render();$('import-controls').click();};
  $('import-controls').onchange=async()=>{
    try{const file=$('import-controls').files[0];if(!file)return;
      if(file.size>16384)throw Error('Keybind files must be smaller than 16 KiB.');
      const next=importBindings(await file.text());release();capture=null;bindings=next;render();persist('Keybindings imported and saved.');
    }catch(error){$('binding-status').textContent=error.message;}
    finally{$('import-controls').value='';}
  };
  window.addEventListener('keydown',e=>{
    if(dialog.open){
      if(!capture)return;
      e.preventDefault();e.stopPropagation();if(e.repeat)return;
      if(e.code==='Escape'){capture=null;render();$('binding-status').textContent='Binding change canceled.';return;}
      if(e.ctrlKey||e.metaKey||e.altKey||!allowedKey(e.code)){ $('binding-status').textContent='Use a single key without Ctrl, Alt, or Command. Escape cancels.';return;}
      const action=capture;bindings=rebind(bindings,action,e.code);capture=null;render();persist(`${ACTIONS.find(([id])=>id===action)[1]} set to ${keyLabel(e.code)}. Saved.`);dialog.querySelector(`[data-action="${action}"]`).focus();return;
    }
    if(!isLoaded()||document.activeElement!==screen||e.ctrlKey||e.metaKey||e.altKey||!Object.values(bindings).includes(e.code))return;
    e.preventDefault();held.add(e.code);send({type:'buttons',mask:maskFor(held,bindings)});
  });
  window.addEventListener('keyup',e=>{if(held.delete(e.code)){e.preventDefault();send({type:'buttons',mask:maskFor(held,bindings)});}});
  screen.addEventListener('blur',release);window.addEventListener('blur',release);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});render();
}
