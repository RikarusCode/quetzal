import {listSlots,addSlot,renameSlot,removeSlot,lockSlot} from './saves.mjs';

export async function setupSaveSlots({db,game,isPlaying,onChange}){
  const $=id=>document.getElementById(id),selectionKey=`quetzal-selected-slot:${game}`;
  const changes=new BroadcastChannel('quetzal-save-slot-changes');
  let slots=[],selected;
  const savedSelection=()=>{try{return localStorage.getItem(selectionKey);}catch{return null;}};
  const remember=()=>{try{localStorage.setItem(selectionKey,selected);}catch{}};
  const error=e=>{$('slots-status').textContent=e.message;};
  async function refresh(preferred){
    slots=await listSlots(db,game);
    selected=[preferred,selected,savedSelection(),new URL(location.href).searchParams.get('slot')].find(id=>slots.some(s=>s.id===id))??slots[0].id;
    $('slot').replaceChildren(...slots.map(s=>new Option(s.name,s.id)));$('slot').value=selected;remember();render();onChange(current());
  }
  function current(){return slots.find(s=>s.id===selected);}
  async function changed(preferred){await refresh(preferred);changes.postMessage('changed');}
  function render(){
    $('slots-list').replaceChildren();
    for(const slot of slots){
      const row=document.createElement('div');row.className='slot-row';
      const input=document.createElement('input');input.value=slot.name;input.maxLength=60;input.setAttribute('aria-label',`Name for ${slot.name}`);
      const rename=document.createElement('button');rename.textContent='Rename';
      rename.onclick=async()=>{try{await renameSlot(db,game,slot.id,input.value);await changed();$('slots-status').textContent='Slot renamed.';}catch(e){error(e);}};
      const remove=document.createElement('button');remove.textContent='Remove';remove.className='danger';
      remove.disabled=slots.length===1||(isPlaying()&&slot.id===selected);
      remove.title=slots.length===1?'Keep at least one slot.':isPlaying()&&slot.id===selected?'End the session before removing this slot.':'';
      remove.onclick=async()=>{
        if(!confirm(`Remove “${slot.name}” and its saved progress from this browser? This cannot be undone. Export a backup first if you want to keep it.`))return;
        let unlock;try{unlock=await lockSlot(game,slot.id);await removeSlot(db,game,slot.id);await changed();$('slots-status').textContent='Slot removed.';}catch(e){error(e);}finally{unlock?.();}
      };
      row.append(input,rename,remove);$('slots-list').append(row);
    }
  }
  $('slot').onchange=()=>{selected=$('slot').value;remember();onChange(current());};
  $('edit-slots').onclick=async()=>{try{await refresh();$('slots-status').textContent=isPlaying()?'End the session to switch or remove this slot.':'';$('slots-dialog').showModal();}catch(e){error(e);}};
  $('close-slots').onclick=$('done-slots').onclick=()=>$('slots-dialog').close();
  $('add-slot-form').onsubmit=async event=>{
    event.preventDefault();try{const slot=await addSlot(db,game,$('new-slot-name').value);$('new-slot-name').value='';await changed(isPlaying()?selected:slot.id);$('slots-status').textContent='Save slot added.';}catch(e){error(e);}
  };
  changes.onmessage=()=>refresh().catch(error);
  await refresh(new URL(location.href).searchParams.get('slot')??savedSelection());
  return {current,refresh};
}
