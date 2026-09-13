const ACTION_IDS=['up','down','left','right','a','b','start','select','l','r'];
export const DEFAULT_GAMEPAD_BINDINGS={up:'b12',down:'b13',left:'b14',right:'b15',a:'b0',b:'b1',start:'b9',select:'b8',l:'b4',r:'b5'};
export function defaultGamepadProfile(standard=true){
  return {bindings:Object.fromEntries(ACTION_IDS.map(id=>[id,standard?DEFAULT_GAMEPAD_BINDINGS[id]:null])),deadzone:.3,leftStick:standard};
}
export function validGamepadInput(value){return typeof value==='string'&&(/^(b([0-9]|[12][0-9]|3[01]))$/.test(value)||/^a([0-9]|1[0-5])[+-]$/.test(value));}
export function validGamepadProfile(profile){
  if(!profile||typeof profile!=='object'||Array.isArray(profile)||!Number.isFinite(profile.deadzone)||profile.deadzone<.15||profile.deadzone>.75||typeof profile.leftStick!=='boolean')return false;
  const b=profile.bindings;
  if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length!==10||!ACTION_IDS.every(id=>Object.hasOwn(b,id)&&(b[id]===null||validGamepadInput(b[id]))))return false;
  const assigned=Object.values(b).filter(Boolean);
  return new Set(assigned).size===assigned.length&&(!profile.leftStick||!assigned.some(token=>/^a[01][+-]$/.test(token)));
}
export function rebindGamepad(profile,action,input){
  if(!validGamepadProfile(profile)||!ACTION_IDS.includes(action)||!validGamepadInput(input))throw Error('Invalid controller binding.');
  const bindings={...profile.bindings},occupied=ACTION_IDS.find(id=>id!==action&&bindings[id]===input);
  if(occupied)bindings[occupied]=bindings[action];
  bindings[action]=input;
  return {...profile,bindings,leftStick:profile.leftStick&&!/^a[01][+-]$/.test(input)};
}
export function exportGamepadProfile(profile){
  if(!validGamepadProfile(profile))throw Error('Invalid controller settings.');
  return JSON.stringify({format:'quetzal-controller',version:1,profile},null,2)+'\n';
}
export function importGamepadProfile(text){
  if(text.length>16384)throw Error('Controller files must be smaller than 16 KiB.');
  let data;try{data=JSON.parse(text);}catch{throw Error('Choose a controller JSON file exported from Quetzal.');}
  if(data?.format!=='quetzal-controller'||data.version!==1||!validGamepadProfile(data.profile))throw Error('Invalid or unsupported Quetzal controller settings.');
  return {bindings:{...data.profile.bindings},deadzone:data.profile.deadzone,leftStick:data.profile.leftStick};
}
// Hysteresis prevents a stick near the deadzone boundary from flickering on/off.
export function gamepadInputs(pad,deadzone=.3,previous=new Set()){
  const inputs=new Set();if(!pad?.connected)return inputs;
  pad.buttons.slice(0,32).forEach((button,i)=>{if(button.pressed||button.value>=(previous.has(`b${i}`)?.35:.55))inputs.add(`b${i}`);});
  pad.axes.slice(0,16).forEach((value,i)=>{
    if(!Number.isFinite(value))return;
    for(const direction of [-1,1]){const token=`a${i}${direction<0?'-':'+'}`;if(value*direction>=(previous.has(token)?deadzone*.75:deadzone))inputs.add(token);}
  });
  return inputs;
}
export function gamepadMask(inputs,profile,actions){
  let mask=actions.reduce((mask,[id,,bit])=>inputs.has(profile.bindings[id])?mask|(1<<bit):mask,0);
  if(profile.leftStick){for(const [token,id] of [['a0-','left'],['a0+','right'],['a1-','up'],['a1+','down']])if(inputs.has(token))mask|=1<<actions.find(([action])=>action===id)[2];}
  return mask;
}
export function gamepadInputLabel(token,standard){
  if(!token)return 'Not set';
  const labels={b0:'Bottom face',b1:'Right face',b2:'Left face',b3:'Top face',b4:'L shoulder',b5:'R shoulder',b6:'L trigger',b7:'R trigger',b8:'Select / View',b9:'Start / Menu',b10:'Left stick click',b11:'Right stick click',b12:'D-pad ↑',b13:'D-pad ↓',b14:'D-pad ←',b15:'D-pad →'};
  if(standard&&labels[token])return labels[token];
  return token[0]==='b'?`Button ${Number(token.slice(1))+1}`:`Axis ${Number(token.slice(1,-1))+1} ${token.at(-1)}`;
}
// Require neutral after focus changes, unplugging, or opening a dialog.
export function createGamepadGate(){
  let armed=false;
  return {reset(){armed=false;},read(mask,enabled){if(!enabled){armed=false;return 0;}if(!mask)armed=true;return armed?mask:0;}};
}
