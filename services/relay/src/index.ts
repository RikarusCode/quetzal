import {DurableObject} from 'cloudflare:workers';
import {BUILD_ID,MAX_PENDING_PACKETS,ROOM_PATTERN,decodePacket} from '../../../apps/harness/relay-protocol.mjs';

type Peer = {id:number|null;epoch:string;closed:boolean;joinedAt:number;lastSeen:number;window:number;messages:number;sent:number;acked:number};
const EPOCH=/^[a-f0-9-]{36}$/;
const report=(message:string,status=400)=>new Response(message,{status,headers:{'Cache-Control':'no-store'}});

export default {
  async fetch(request,env):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==='/health')return Response.json({ok:true,build:BUILD_ID,transport:'websocket'});
    if(!url.pathname.startsWith('/relay/'))return env.ASSETS.fetch(request);
    if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return report('WebSocket upgrade required.',426);
    const room=url.pathname.slice('/relay/'.length);
    if(!ROOM_PATTERN.test(room)||url.search)return report('Invalid room code.');
    const origin=request.headers.get('Origin');
    const allowed=[url.origin,...env.ALLOWED_ORIGINS.split(',').map(s=>s.trim())];
    if(!origin||!allowed.includes(origin))return report('Origin is not allowed.',403);
    // fetch is used here because WebSocket upgrade responses cross this boundary.
    return env.ROOMS.getByName(room).fetch(request);
  }
} satisfies ExportedHandler<Env>;

export class GameRoom extends DurableObject<Env>{
  peers(){return this.ctx.getWebSockets().filter(ws=>!this.peer(ws).closed);}
  peer(ws:WebSocket):Peer{return ws.deserializeAttachment() as Peer;}
  members(){return this.peers().filter(ws=>this.peer(ws).id!==null);}
  roster(){
    const members=this.members().map(ws=>{const p=this.peer(ws);return {id:p.id,epoch:p.epoch};}).sort((a,b)=>a.id!-b.id!);
    for(const ws of this.members())this.write(ws,{type:'roster',members});
  }
  write(ws:WebSocket,data:unknown){ws.send(JSON.stringify(data));}
  end(ws:WebSocket,message:string,code=4000){
    const p=this.peer(ws);if(p.closed)return;
    p.closed=true;ws.serializeAttachment(p);
    try{this.write(ws,{type:'error',message});ws.close(code,'Session ended');}catch{}
  }
  endSession(ws:WebSocket,message:string){
    const p=this.peer(ws);if(p.closed)return;
    this.end(ws,message);
    if(p.id===0){for(const other of this.peers())this.end(other,'The host left and the room closed. Create or join another room.');}
    else if(p.id!==null)this.roster();
  }
  async fetch(request:Request){
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return report('WebSocket upgrade required.',426);
    const pair=new WebSocketPair();const [client,server]=Object.values(pair);
    // Pending upgrades are bounded too; unregistered peers expire by alarm.
    if(this.peers().length>=4){server.accept();this.write(server,{type:'error',message:'Room is full (4/4 players). Ask the host for a space.'});server.close(4001,'Room full');}
    else{
      const now=Date.now();
      server.serializeAttachment({id:null,epoch:'',closed:false,joinedAt:now,lastSeen:now,window:now,messages:0,sent:0,acked:0} satisfies Peer);
      this.ctx.acceptWebSocket(server);
      await this.ctx.storage.setAlarm(now+15000);
    }
    return new Response(null,{status:101,webSocket:client});
  }
  webSocketMessage(ws:WebSocket,data:string|ArrayBuffer){
    const p=this.peer(ws);if(p.closed)return;
    const now=Date.now();if(now-p.window>=1000){p.window=now;p.messages=0;}
    if(++p.messages>1200){this.endSession(ws,'Connection sent too many messages.');return;}
    p.lastSeen=now;ws.serializeAttachment(p);
    try{
      if(typeof data==='string'){
        if(data.length>1024)throw Error('Control message too large.');
        const m=JSON.parse(data);
        if(!m||typeof m!=='object')throw Error('Invalid control message.');
        if(p.id===null){
          if(m.build!==BUILD_ID){this.end(ws,'Game or emulator version mismatch. Refresh all players.');return;}
          if(m.type!=='join'||!['create','join'].includes(m.intent)||typeof m.epoch!=='string'||!EPOCH.test(m.epoch))throw Error('Invalid join request.');
          const ids=this.members().map(other=>this.peer(other).id);
          if(m.intent==='create'&&ids.includes(0)){this.end(ws,'A host already owns this room. Create a new room.');return;}
          if(m.intent==='join'&&!ids.includes(0)){this.end(ws,'Room not found. Check the code and ask the host to create a room first.');return;}
          p.id=m.intent==='create'?0:[1,2,3].find(id=>!ids.includes(id))??null;
          if(p.id===null){this.end(ws,'Room is full (4/4 players).');return;}
          p.epoch=m.epoch;ws.serializeAttachment(p);this.write(ws,{type:'joined',id:p.id,build:BUILD_ID});this.roster();return;
        }
        if(m.type==='ping'){
          if(!Number.isFinite(m.at))throw Error('Invalid ping.');this.write(ws,{type:'pong',at:m.at});return;
        }
        if(m.type==='ack'){
          if(!Number.isSafeInteger(m.sequence)||m.sequence<p.acked||m.sequence>p.sent)throw Error('Invalid packet acknowledgment.');
          p.acked=m.sequence;ws.serializeAttachment(p);return;
        }
        if(m.type==='stop'){this.endSession(ws,'Disconnected.');return;}
        if(!['heartbeat','echo'].includes(m.type))throw Error('Unknown control message.');
        if(m.from!==p.id||m.epoch!==p.epoch)throw Error('Sender identity mismatch.');
        if(![0,1,2,3].includes(m.to)||m.to===p.id)throw Error('Invalid recipient.');
        const other=this.members().find(other=>this.peer(other).id===m.to);if(!other)return;
        const op=this.peer(other);
        if(m.toEpoch!==op.epoch)return; // A departed ID can be reassigned; discard its stale controls.
        if(['heartbeat','echo'].includes(m.type)&&!Number.isFinite(m.at))throw Error('Invalid peer ping.');
        this.write(other,{type:m.type,from:p.id,epoch:p.epoch,toEpoch:op.epoch,...(Number.isFinite(m.at)?{at:m.at}:{})});return;
      }
      if(p.id===null)throw Error('Join before sending game packets.');
      const packet=decodePacket(data); // Validate before any native core receives data.
      const recipients=this.members().filter(other=>other!==ws&&(packet.to===65535||this.peer(other).id===packet.to));
      if(recipients.some(other=>{const op=this.peer(other);return op.sent-op.acked>=MAX_PENDING_PACKETS;})){
        // Never partially deliver a native broadcast to a group with a slow receiver.
        for(const member of this.members())this.end(member,'Receiving player is too slow. Reconnect to retry.');return;
      }
      for(const other of recipients){
        const op=this.peer(other),frame=data.slice(0),view=new DataView(frame);view.setUint8(2,p.id);view.setUint32(4,++op.sent);
        other.serializeAttachment(op);other.send(frame);
      }
    }catch(error){
      const message=error instanceof Error?error.message:'Invalid relay message.';
      if(p.id===null)this.end(ws,message);else this.endSession(ws,message);
    }
  }
  webSocketClose(ws:WebSocket){this.endSession(ws,'Connection closed.');}
  webSocketError(ws:WebSocket){this.endSession(ws,'Connection interrupted.');}
  async alarm(){
    const now=Date.now();
    for(const ws of this.peers()){
      const p=this.peer(ws);
      if(p.id===null&&now-p.joinedAt>=10000)this.end(ws,'Join request timed out.');
      else if(now-p.lastSeen>=20000)this.endSession(ws,'Player stopped responding.');
    }
    if(this.peers().length)await this.ctx.storage.setAlarm(now+15000);
  }
}
