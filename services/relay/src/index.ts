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
  other(ws:WebSocket){return this.peers().find(p=>p!==ws&&this.peer(p).id!==null);}
  write(ws:WebSocket,data:unknown){ws.send(JSON.stringify(data));}
  end(ws:WebSocket,message:string,code=4000){
    const p=this.peer(ws);if(p.closed)return;
    p.closed=true;ws.serializeAttachment(p);
    try{this.write(ws,{type:'error',message});ws.close(code,'Session ended');}catch{}
  }
  endSession(ws:WebSocket,message:string){
    const p=this.peer(ws);if(p.closed)return;
    const other=this.other(ws);this.end(ws,message);
    if(other)this.end(other,'Peer left. Reconnect here, then rejoin in the game.');
  }
  async fetch(request:Request){
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return report('WebSocket upgrade required.',426);
    const pair=new WebSocketPair();const [client,server]=Object.values(pair);
    // Pending upgrades are bounded too; unregistered peers expire by alarm.
    if(this.peers().length>=2){server.accept();this.write(server,{type:'error',message:'Room is full. Use another room code.'});server.close(4001,'Room full');}
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
          if(m.type!=='join'||![0,1].includes(m.id)||typeof m.epoch!=='string'||!EPOCH.test(m.epoch))throw Error('Invalid join request.');
          if(m.build!==BUILD_ID){this.end(ws,'Game or emulator version mismatch. Refresh both players.');return;}
          if(this.peers().some(other=>other!==ws&&this.peer(other).id===m.id)){this.end(ws,m.id===0?'A host already owns this room. Choose Join or another code.':'Player B is already connected.');return;}
          p.id=m.id;p.epoch=m.epoch;ws.serializeAttachment(p);this.write(ws,{type:'joined',id:p.id,build:BUILD_ID});return;
        }
        if(m.type==='ping'){
          if(!Number.isFinite(m.at))throw Error('Invalid ping.');this.write(ws,{type:'pong',at:m.at});return;
        }
        if(m.type==='ack'){
          if(!Number.isSafeInteger(m.sequence)||m.sequence<p.acked||m.sequence>p.sent)throw Error('Invalid packet acknowledgment.');
          p.acked=m.sequence;ws.serializeAttachment(p);return;
        }
        if(m.type==='stop'){this.endSession(ws,'Disconnected.');return;}
        if(!['hello','ready','heartbeat','echo'].includes(m.type))throw Error('Unknown control message.');
        if(m.from!==p.id||m.epoch!==p.epoch)throw Error('Sender identity mismatch.');
        if(m.type==='hello'&&p.id!==1||m.type==='ready'&&p.id!==0)throw Error('Invalid handshake role.');
        const other=this.other(ws);if(!other)return;
        const op=this.peer(other);
        if(m.type!=='hello'&&m.toEpoch!==op.epoch)throw Error('Session epoch mismatch.');
        if(['heartbeat','echo'].includes(m.type)&&!Number.isFinite(m.at))throw Error('Invalid peer ping.');
        this.write(other,{type:m.type,from:p.id,epoch:p.epoch,toEpoch:op.epoch,...(Number.isFinite(m.at)?{at:m.at}:{})});return;
      }
      if(p.id===null)throw Error('Join before sending game packets.');
      decodePacket(data); // Reject malformed data before it reaches the native core.
      const other=this.other(ws);if(!other)return;
      const op=this.peer(other);
      if(op.sent-op.acked>=MAX_PENDING_PACKETS){this.endSession(ws,'Receiving player is too slow. Reconnect to retry.');return;}
      const frame=data.slice(0),view=new DataView(frame);view.setUint8(2,p.id);view.setUint32(4,++op.sent);
      other.serializeAttachment(op);other.send(frame);
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
