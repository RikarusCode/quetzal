import {BUILD_ID,MAX_SOCKET_BUFFER,decodePacket,encodePacket,relaySocketURL} from './relay-protocol.mjs';

// BroadcastChannel-shaped adapter; core callbacks stay on the emulator owner.
export class WebSocketChannel {
  constructor({endpoint,room,id,epoch,delayMs=0,jitterMs=0,socketFactory=url=>new WebSocket(url)}){
    Object.assign(this,{id,epoch,ready:false,remote:'',closed:false,pending:[],lastDue:0,lastSequence:0,ackSequence:0,relayRttMs:null});
    this.delayMs=Math.max(0,Math.min(250,Number(delayMs)||0));this.jitterMs=Math.max(0,Math.min(100,Number(jitterMs)||0));
    this.socket=socketFactory(relaySocketURL(endpoint,room));this.socket.binaryType='arraybuffer';this.lastResponse=performance.now();
    this.timeout=setTimeout(()=>this.fail('Relay connection timed out. Check the relay address.'),10000);
    this.socket.onopen=()=>this.sendJSON({type:'join',id,epoch,build:BUILD_ID});
    this.socket.onmessage=({data})=>{try{this.receive(data);}catch(error){this.fail(error.message);}};
    this.socket.onerror=()=>this.fail('Cannot reach the relay. Check its address and that it is running.');
    this.socket.onclose=()=>{if(!this.closed)this.fail('Relay connection closed. Reconnect here, then rejoin in the game.');};
  }
  sendJSON(value){this.send(JSON.stringify(value));}
  send(data){
    if(this.closed||this.socket.readyState!==1)return;
    if(this.socket.bufferedAmount>MAX_SOCKET_BUFFER){this.fail('Outgoing connection is too slow. Reconnect to retry.');return;}
    this.socket.send(data);
  }
  postMessage(m){
    if(!this.ready||this.closed)return;
    if(m.type==='packet')this.send(encodePacket(m.flags,m.bytes));else this.sendJSON(m);
  }
  receive(data){
    if(data instanceof ArrayBuffer){
      const packet=decodePacket(data);
      if(!this.ready||!this.remote||packet.from===this.id||packet.sequence!==this.lastSequence+1)throw Error('Relay packet sequence or sender mismatch.');
      this.lastSequence=packet.sequence;
      this.enqueue({type:'packet',from:packet.from,epoch:this.remote,toEpoch:this.epoch,flags:packet.flags,bytes:packet.bytes},packet.sequence);return;
    }
    if(typeof data!=='string'||data.length>2048)throw Error('Invalid relay control message.');
    const m=JSON.parse(data);
    if(m.type==='error'){this.fail(m.message);return;}
    if(m.type==='joined'){
      if(this.ready||m.id!==this.id||m.build!==BUILD_ID)throw Error('Relay compatibility mismatch.');
      clearTimeout(this.timeout);this.ready=true;this.onready?.();
      this.pingTimer=setInterval(()=>{
        if(performance.now()-this.lastResponse>15000){this.fail('Relay stopped responding. Reconnect to retry.');return;}
        this.sendJSON({type:'ping',at:performance.now()});
      },2000);return;
    }
    if(m.type==='pong'){
      if(!Number.isFinite(m.at))throw Error('Invalid relay ping response.');
      this.lastResponse=performance.now();this.relayRttMs=Math.round(this.lastResponse-m.at);return;
    }
    if(m.type==='peer-left'){this.fail('Peer left. Reconnect here, then rejoin in the game.');return;}
    if(!this.ready||m.from===this.id||![0,1].includes(m.from)||typeof m.epoch!=='string')throw Error('Invalid relay sender.');
    if(m.type==='hello'||m.type==='ready')this.remote=m.epoch;
    this.enqueue(m);
  }
  enqueue(message,sequence=0){
    if(this.pending.length>=512)throw Error('Incoming connection queue overflow.');
    const delay=this.delayMs+(this.jitterMs?Math.random()*this.jitterMs:0);
    const due=Math.max(this.lastDue,performance.now()+delay);this.lastDue=due; // Preserve reliable ordering.
    this.pending.push({message,sequence,due});if(!this.deliveryTimer)this.schedule();
  }
  schedule(){
    if(!this.pending.length||this.closed)return;
    this.deliveryTimer=setTimeout(()=>{
      this.deliveryTimer=null;
      try{
        while(this.pending.length&&this.pending[0].due<=performance.now()){
          const item=this.pending.shift();this.onmessage?.({data:item.message});if(this.closed)return;
          if(item.sequence)this.ackSequence=item.sequence;
        }
        if(this.ackSequence){this.sendJSON({type:'ack',sequence:this.ackSequence});this.ackSequence=0;}
        this.schedule();
      }catch(error){this.fail(error.message);}
    },Math.max(0,this.pending[0].due-performance.now()));
  }
  fail(message){if(this.closed)return;this.close();this.onerror?.(new Error(message));}
  close(){
    this.closed=true;this.ready=false;clearTimeout(this.timeout);clearTimeout(this.deliveryTimer);clearInterval(this.pingTimer);
    this.pending=[];this.socket.close();
  }
}
