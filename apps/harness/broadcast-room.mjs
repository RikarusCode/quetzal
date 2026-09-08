import {BUILD_ID,validGamePacket} from './relay-protocol.mjs';

// Same-browser transport. The creator assigns IDs; saves never enter this channel.
export class BroadcastRoomChannel {
  constructor({room,intent,epoch,channelFactory=name=>new BroadcastChannel(name)}){
    Object.assign(this,{room,intent,epoch,id:null,ready:false,closed:false,members:[],seen:new Map(),lastHost:performance.now()});
    this.bus=channelFactory(`quetzal-room-v2-${room}`);
    this.bus.onmessage=({data})=>{try{this.receive(data);}catch(error){this.fail(error.message);}};
    queueMicrotask(()=>this.begin());
  }
  begin(){
    if(this.closed)return;
    if(this.intent==='create'){
      this.id=0;this.ready=true;this.members=[{id:0,epoch:this.epoch}];this.onready?.();if(this.closed)return;this.publish();
    }else this.register();
    this.timer=setInterval(()=>{
      if(this.id===0){
        this.members=this.members.filter(p=>p.id===0||performance.now()-(this.seen.get(p.epoch)??0)<8000);this.publish();
      }else if(!this.ready){
        if(performance.now()-this.lastHost>3000){this.fail('Room not found in this browser. Check the code and connection setting.');return;}this.register();
      }else{
        if(performance.now()-this.lastHost>10000){this.fail('The host stopped responding. Create or join another room.');return;}
        this.bus.postMessage({type:'presence',from:this.id,epoch:this.epoch});
      }
    },500);
  }
  register(){this.bus.postMessage({type:'register',epoch:this.epoch,build:BUILD_ID});}
  publish(){
    const m={type:'roster',members:this.members,epoch:this.epoch};this.bus.postMessage(m);this.onmessage?.({data:m});
  }
  receive(m){
    if(this.closed||!m)return;
    if(m.type==='register'&&this.id===0){
      if(m.build!==BUILD_ID){this.bus.postMessage({type:'rejected',toEpoch:m.epoch,message:'Game version mismatch. Refresh all players.'});return;}
      if(!this.members.some(p=>p.epoch===m.epoch)){
        const id=[1,2,3].find(id=>!this.members.some(p=>p.id===id));
        if(id===undefined){this.bus.postMessage({type:'rejected',toEpoch:m.epoch,message:'Room is full (4/4 players).'});return;}
        this.members.push({id,epoch:m.epoch});
      }
      this.seen.set(m.epoch,performance.now());this.publish();return;
    }
    if(m.type==='rejected'&&m.toEpoch===this.epoch){this.fail(m.message);return;}
    if(m.type==='roster'){
      if(this.id===0){if(m.epoch!==this.epoch)this.fail('Another host is using this code. Create a new room.');return;}
      const self=m.members?.find(p=>p.epoch===this.epoch);
      if(!self){if(this.ready)this.fail('You left the room. Reconnect to join again.');return;}
      if(this.ready&&m.epoch!==this.members.find(p=>p.id===0)?.epoch)return;
      this.lastHost=performance.now();this.members=m.members;
      if(!this.ready){this.id=self.id;this.ready=true;this.onready?.();}
      if(this.closed)return;
      this.onmessage?.({data:m});return;
    }
    const peer=this.members.find(p=>p.id===m.from&&p.epoch===m.epoch);
    if(!peer||m.from===this.id)return;
    this.seen.set(peer.epoch,performance.now());
    if(m.type==='stop'){
      if(m.from===0){this.fail('The host left and the room closed. Create or join another room.');return;}
      if(this.id===0){this.members=this.members.filter(p=>p.epoch!==m.epoch);this.publish();}return;
    }
    if(m.type==='presence')return;
    if(m.to!==65535&&m.to!==this.id)return;
    if(m.type==='packet'&&!validGamePacket(m.bytes))throw Error('Invalid emulator packet.');
    this.onmessage?.({data:{...m,toEpoch:this.epoch}});
  }
  postMessage(m){if(this.ready&&!this.closed)this.bus.postMessage({...m,from:this.id,epoch:this.epoch});}
  fail(message){if(this.closed)return;this.close();this.onerror?.(new Error(message));}
  close(){
    if(this.closed)return;this.postMessage({type:'stop'});this.closed=true;this.ready=false;clearInterval(this.timer);this.bus.close();
  }
}
