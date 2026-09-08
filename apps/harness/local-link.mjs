// The emulator owns core callbacks; this transport only queues inbound packets.
export class LocalLink {
  constructor({core,onState,channelFactory=name=>new BroadcastChannel(name),now=()=>performance.now()}){
    Object.assign(this,{core,onState,channelFactory,now});this.state='idle';this.queue=[];this.sent=0;this.received=0;
  }
  get connected(){return this.state==='connected';}
  status(state,reason){this.state=state;this.onState({state,connected:this.connected,reason});}
  send(type,data={}){this.channel?.postMessage({type,from:this.id,epoch:this.epoch,toEpoch:this.remote,...data});}
  close(){
    clearInterval(this.timer);this.channel?.close();this.channel=null;
    this.core._host_link_stop();this.queue=[];this.state='idle';
  }
  stop(reason='Disconnected. You can host or join another room.'){
    this.send('stop');this.close();this.status('idle',reason);
  }
  start(room,id){
    if(this.state!=='idle')return;
    if(!/^[a-zA-Z0-9_-]{1,32}$/.test(room)||![0,1].includes(id))throw Error('Invalid room or player.');
    this.id=id;this.epoch=crypto.randomUUID();this.remote='';this.sent=0;this.received=0;this.rttMs=null;
    try{
      this.channel=this.channelFactory(`quetzal-mul-poke-8d268a6-v2-${room}`,{room,id,epoch:this.epoch});
      this.channel.onmessage=({data:m})=>{try{this.message(m);}catch(error){this.stop('Connection error: '+error.message);}};
      this.channel.onerror=error=>this.stop(error.message);
      const begin=()=>{
        try{
          if(id===0&&!this.core._host_link_start(0))throw Error('The emulator could not start link hosting.');
          this.status(id===0?'hosting':'searching',id===0?'Hosting · waiting for Player B…':'Joined room · waiting for the host…');
          this.pulse();this.timer=setInterval(()=>this.pulse(),250);
        }catch(error){this.stop(error.message);}
      };
      if(this.channel.ready===false){this.status('connecting','Connecting to relay…');this.channel.onready=begin;}else begin();
    }catch(error){this.close();this.status('idle','Connection failed: '+error.message);}
  }
  pulse(){
    if(this.connected){
      if(this.now()-this.lastPeer>5000){this.stop('Peer stopped responding. Reconnect here, then rejoin in the game.');return;}
      this.send('heartbeat',{at:this.now()});
    }else if(this.state==='searching')this.send('hello');
  }
  message(m){
    if(!m||m.from===this.id||![0,1].includes(m.from)||typeof m.epoch!=='string')return;
    if(m.type==='hello'&&this.id===0){
      if(this.connected&&this.remote!==m.epoch)return;
      if(!this.connected){
        if(!this.core._host_connected(1)){this.stop('The emulator rejected the joining player. Start a new room.');return;}
        this.remote=m.epoch;this.status('connected');
      }
      this.lastPeer=this.now();this.send('ready');return;
    }
    if(m.type==='ready'&&this.id===1&&m.toEpoch===this.epoch){
      if(this.connected&&this.remote!==m.epoch)return;
      if(!this.connected){
        if(!this.core._host_link_start(1))throw Error('The emulator could not start wireless joining.');
        this.remote=m.epoch;this.status('connected');
      }
      this.lastPeer=this.now();return;
    }
    if(!this.connected||m.epoch!==this.remote||m.toEpoch!==this.epoch)return;
    this.lastPeer=this.now();
    if(m.type==='heartbeat'){this.send('echo',{at:m.at});return;}
    if(m.type==='echo'){if(Number.isFinite(m.at))this.rttMs=Math.round(this.now()-m.at);return;}
    if(m.type==='stop'){this.close();this.status('idle','Peer left. Reconnect here, then rejoin in the game.');return;}
    if(m.type==='packet'){
      if(!(m.bytes instanceof Uint8Array)||m.bytes.length>65536||this.queue.length>=512){this.stop('Invalid packet or packet queue overflow. Start a new room.');return;}
      this.queue.push(m);
    }
  }
  packet(flags,bytes,to){
    if(this.connected&&bytes.length&&(to===65535||to===(this.id===0?1:0))){this.send('packet',{bytes,flags});this.sent++;}
  }
  drain(){
    for(const p of this.queue.splice(0)){
      const ptr=this.core._malloc(p.bytes.length);
      try{this.core.HEAPU8.set(p.bytes,ptr);this.core._host_receive(ptr,p.bytes.length,p.from);this.received++;}
      finally{this.core._free(ptr);}
    }
  }
}
