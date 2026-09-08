import {BroadcastRoomChannel} from './broadcast-room.mjs';

// All native callbacks execute on the emulator owner, never on the relay.
export class LocalLink {
  constructor({core,onState,channelFactory=(_name,peer)=>new BroadcastRoomChannel(peer),now=()=>performance.now()}){
    Object.assign(this,{core,onState,channelFactory,now});this.state='idle';this.queue=[];this.members=[];this.sent=0;this.received=0;
  }
  get connected(){return this.state==='connected';}
  status(state,reason){this.state=state;this.onState({state,connected:this.connected,reason,id:this.id,members:this.members.map(({id})=>({id})),room:this.room});}
  send(type,to,data={}){const peer=this.members.find(p=>p.id===to);this.channel?.postMessage({type,from:this.id,epoch:this.epoch,to,toEpoch:peer?.epoch,...data});}
  close(){clearInterval(this.timer);this.channel?.close();this.channel=null;this.core._host_link_stop();this.queue=[];this.members=[];this.state='idle';}
  stop(reason='Left room.'){
    this.channel?.postMessage({type:'stop'});this.close();this.status('idle',reason);
  }
  start(room,intent){
    if(this.state!=='idle')return;
    intent=intent===0?'create':typeof intent==='number'?'join':intent;
    if(!/^[a-f0-9]{32}$/.test(room)||!['create','join'].includes(intent))throw Error('Invalid room or action.');
    this.room=room;this.id=null;this.epoch=crypto.randomUUID();this.sent=0;this.received=0;this.rttMs=null;this.lastPeer=new Map();
    try{
      this.channel=this.channelFactory(`quetzal-v2-${room}`,{room,intent,epoch:this.epoch});
      this.channel.onmessage=({data:m})=>{try{this.message(m);}catch(error){this.stop('Connection error: '+error.message);}};
      this.channel.onerror=error=>{this.close();this.status('idle',error.message);};
      this.channel.onready=()=>{
        try{
          this.id=this.channel.id;
          if(!this.core._host_link_start(this.id))throw Error('The emulator could not start multiplayer.');
          this.timer=setInterval(()=>this.pulse(),250);
        }catch(error){this.stop(error.message);}
      };
      this.status('connecting',intent==='create'?'Creating your room…':'Joining room…');
    }catch(error){this.close();this.status('idle','Connection failed: '+error.message);}
  }
  roster(members){
    if(!Array.isArray(members)||members.length>4||!members.some(p=>p.id===this.id&&p.epoch===this.epoch))throw Error('Invalid room membership.');
    if(members.length===this.members.length&&members.every(p=>this.members.some(old=>p.id===old.id&&p.epoch===old.epoch)))return;
    const departed=this.members.some(old=>!members.some(p=>p.id===old.id&&p.epoch===old.epoch));
    if(departed){
      // Keep the room, but reset serial state before a freed player ID is reused.
      // Players must rejoin through Quetzal after membership is reduced.
      this.core._host_link_stop();this.queue=[];
      if(!this.core._host_link_start(this.id))throw Error('Could not restart multiplayer after a player left.');
    }
    if(this.id===0)for(const p of members){
      if(p.id!==0&&(departed||!this.members.some(old=>old.id===p.id&&old.epoch===p.epoch)))
        if(!this.core._host_connected(p.id))throw Error('The emulator rejected another player.');
    }
    this.members=members.map(p=>({...p}));
    for(const p of members)if(!this.lastPeer.has(p.epoch))this.lastPeer.set(p.epoch,this.now());
    for(const epoch of this.lastPeer.keys())if(!members.some(p=>p.epoch===epoch))this.lastPeer.delete(epoch);
    this.status(members.length>1?'connected':'hosting',departed?'A player left. Rejoin Multiplayer in Quetzal.':members.length>1?'Connected. Open Multiplayer in Quetzal.':'Waiting for players.');
  }
  pulse(){
    for(const p of this.members){
      if(p.id===this.id)continue;
      if(this.now()-this.lastPeer.get(p.epoch)>10000){this.stop('A player stopped responding. Reconnect, then rejoin in Quetzal.');return;}
      this.send('heartbeat',p.id,{at:this.now()});
    }
  }
  message(m){
    if(m?.type==='roster'){this.roster(m.members);return;}
    const peer=this.members.find(p=>p.id===m?.from);
    if(!peer||m.from===this.id||m.epoch!==peer.epoch||m.toEpoch!==this.epoch)return;
    this.lastPeer.set(peer.epoch,this.now());
    if(m.type==='heartbeat'){this.send('echo',m.from,{at:m.at});return;}
    if(m.type==='echo'){if(Number.isFinite(m.at))this.rttMs=Math.round(this.now()-m.at);return;}
    if(m.type==='packet'){
      if(!(m.bytes instanceof Uint8Array)||m.bytes.length!==24||this.queue.length>=512)throw Error('Invalid packet or incoming queue overflow.');
      this.queue.push(m);
    }
  }
  packet(flags,bytes,to){
    if(this.connected&&bytes.length&&(to===65535||this.members.some(p=>p.id===to&&p.id!==this.id))){
      this.channel.postMessage({type:'packet',from:this.id,epoch:this.epoch,to,flags,bytes});this.sent++;
    }
  }
  drain(){
    for(const p of this.queue.splice(0)){
      const ptr=this.core._malloc(p.bytes.length);
      try{this.core.HEAPU8.set(p.bytes,ptr);this.core._host_receive(ptr,p.bytes.length,p.from);this.received++;}
      finally{this.core._free(ptr);}
    }
  }
}
