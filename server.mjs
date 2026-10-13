import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import QRCode from 'qrcode';
import {Desktop} from './desktop.mjs';
import {serveAsset} from './static-assets.mjs';
import {readCatalog} from './catalog.mjs';
import {attachLive} from './live.mjs';
import {listModels,modelChoice,catalogProvider} from './models.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));

const port=Number(process.env.PORT??43127);
const addresses=Object.values(os.networkInterfaces()).flat().filter(x=>x?.family==='IPv4'&&!x.internal).map(x=>x.address);
const lan=process.env.LAN_IP??addresses.find(x=>/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(x))??'127.0.0.1';
const publicOrigin=process.env.PUBLIC_ORIGIN??`http://${lan}:${port}`;
if(new URL(publicOrigin).protocol!=='https:'&&new URL(publicOrigin).hostname!==lan)throw Error('公网地址必须使用 HTTPS');
const allowedHosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`,`${lan}:${port}`,new URL(publicOrigin).host]);
const secret=()=>randomBytes(32).toString('base64url');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const admin=secret(),sessions=new Map(),streams=new Set(),attempts=new Map();
let pairing=null,enabled=true;
const socketPath=process.env.DESKTOP_SOCKET??path.join(process.env.CODEX_HOME??path.join(os.homedir(),'.codex'),'ipc/ipc.sock');
const clients=new Map(),opening=new Map();
const connectionView=()=>({connected:[...clients.values()].some(d=>d.connected),connectedThreads:clients.size});
const unavailable=new Map(),historyCache=new Map();
async function history(id){let h=historyCache.get(id);if(!h||Date.now()-h.time>5000){h={time:Date.now(),view:await readCatalog(id)};historyCache.set(id,h);if(historyCache.size>8)historyCache.delete(historyCache.keys().next().value)}return h.view}
let catalogCache=null,catalogTime=0;
async function catalog(){if(!catalogCache||Date.now()-catalogTime>3000){catalogCache=await readCatalog();catalogTime=Date.now()}return catalogCache}
async function selected(id){
  if(typeof id!=='string'||!id)throw Error('请先选择会话');
  const index=await catalog();
  if(!index.workspaces.some(p=>p.tasks.some(t=>t.id===id)))throw Error('任务不存在或已归档');
  if(clients.has(id))return clients.get(id);
  if(unavailable.get(id)>Date.now())return null;
  if(opening.has(id))return opening.get(id);
  const promise=(async()=>{const d=new Desktop({threadId:id,socketPath});
    try{const deadline=setTimeout(()=>d.close(),1600);try{await d.connect()}finally{clearTimeout(deadline)}await new Promise(resolve=>{if(d.state)return resolve();const timer=setTimeout(()=>{d.off('change',changed);resolve()},600);function changed(){if(d.state){clearTimeout(timer);d.off('change',changed);resolve()}}d.on('change',changed)});
      if(!d.state){d.close();unavailable.set(id,Date.now()+15000);return null}
      if(clients.size>=8){const old=clients.keys().next().value;clients.get(old).close();clients.delete(old)}clients.set(id,d);d.on('change',()=>{clearTimeout(d.emitTimer);d.emitTimer=setTimeout(broadcast,100)});return d;
    }catch{d.close();unavailable.set(id,Date.now()+15000);return null}finally{opening.delete(id)}})();opening.set(id,promise);return promise;
}
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
const loopback=req=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const token=req=>req.headers.authorization?.replace(/^Bearer /,'');
const isAdmin=req=>loopback(req)&&[`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)&&!req.headers['x-forwarded-for']&&!req.headers['cf-connecting-ip']&&equal(token(req),admin);
function authenticate(req){const t=token(req),expires=sessions.get(t);if(enabled&&expires>Date.now())return true;if(t)sessions.delete(t);return false;}
function rotate(){pairing={code:secret(),expires:Date.now()+5*60*1000};enabled=true;}
function broadcast(){for(const s of streams){if((!enabled&&!s.admin)||s.expires<Date.now()){s.res.end();streams.delete(s)}else if(s.res.writableLength>1024*1024){s.res.destroy();streams.delete(s)}else s.res.write(`data: ${JSON.stringify(clients.get(s.threadId)?.view()??connectionView())}\n\n`)}}
async function body(req){let data='';for await(const b of req){data+=b;if(data.length>65536)throw Error('请求过大')}return JSON.parse(data||'{}');}
const server=http.createServer(async(req,res)=>{
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  try{
    if(!allowedHosts.has(req.headers.host))return json(res,403,{error:'Invalid host'});
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)return json(res,403,{error:'Invalid origin'});
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&await serveAsset(req,res,url.pathname,root))return;
    if(req.method==='GET'&&['/','/admin','/app.js','/style.css','/markdown.mjs','/icons.mjs','/state-sync.mjs','/live-client.mjs','/vendor/marked.esm.js','/vendor/purify.es.mjs'].includes(url.pathname)){
      const name=['/','/admin'].includes(url.pathname)?'index.html':url.pathname.slice(1);
      res.setHeader('Content-Type',/\.m?js$/.test(name)?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.setHeader('Cache-Control','no-store');return res.end(await readFile(path.join(root,'public',name)));
    }
    if(req.method==='POST'&&req.headers['content-type']?.split(';')[0]!=='application/json')return json(res,415,{error:'JSON required'});
    if(url.pathname==='/api/pair'&&req.method==='POST'){
      const ip=req.headers['cf-connecting-ip']??req.socket.remoteAddress,now=Date.now();let a=attempts.get(ip);if(!a||a.until<now){a={count:0,until:now+60000};attempts.set(ip,a)}if(++a.count>10)return json(res,429,{error:'尝试过多，请一分钟后重试'});
      const b=await body(req);if(!enabled||!pairing||pairing.expires<now||!equal(b.code,pairing.code))return json(res,401,{error:'二维码已失效，请在电脑端刷新'});
      const session=secret();sessions.set(session,now+8*60*60*1000);pairing=null;broadcast();return json(res,200,{session,expires:now+8*60*60*1000,catalog:await catalog().catch(()=>undefined)});
    }
    if(url.pathname.startsWith('/api/admin/')){
      if(!isAdmin(req))return json(res,401,{error:'电脑端认证失败'});
      if(url.pathname==='/api/admin/pairing'&&req.method==='GET'){
        const link=pairing&&pairing.expires>Date.now()?`${publicOrigin}/#pair=${pairing.code}`:null;
        return json(res,200,{networkMode:publicOrigin.startsWith('https:')?'public':'lan',enabled,link,qr:link?await QRCode.toDataURL(link,{width:360,margin:2}):null,expires:pairing?.expires??null,devices:sessions.size,view:connectionView()});
      }
      if(url.pathname==='/api/admin/refresh'&&req.method==='POST'){rotate();return json(res,200,{ok:true})}
      if(url.pathname==='/api/admin/stop'&&req.method==='POST'){enabled=false;pairing=null;sessions.clear();broadcast();live.revoke();return json(res,200,{ok:true})}
    }
    if(!isAdmin(req)&&!authenticate(req))return json(res,401,{error:'连接已失效，请重新扫码'});
    if(url.pathname==='/api/models'&&req.method==='GET')return json(res,200,{models:await listModels()});
    if(url.pathname==='/api/model'&&req.method==='POST'){
      const b=await body(req),d=await selected(b.threadId);if(!d)throw Error('请先在 Desktop 打开此任务');
      const choice=modelChoice(await listModels(),b.model,d.view().reasoningEffort);
      return json(res,200,await d.setModel(choice.model,choice.effort,await catalogProvider()));
    }
    if(url.pathname==='/api/permissions'&&req.method==='POST'){
      const b=await body(req),d=await selected(b.threadId);if(!d)throw Error('请先在 Desktop 打开此任务');
      return json(res,200,await d.setPermissions(b));
    }
    if(url.pathname==='/api/catalog'&&req.method==='GET'){
      const c=structuredClone(await catalog());for(const p of c.workspaces)for(const t of p.tasks){const d=clients.get(t.id);if(d?.connected&&d.state)t.status=d.view().status==='active'?'active':'idle'}
      return json(res,200,c);
    }
    if(url.pathname==='/api/state'&&req.method==='GET'){
      const id=url.searchParams.get('threadId'),d=await selected(id);
      if(!d)return json(res,200,await history(id));
      const revision=d.revision;
      if(d.connected&&revision!=null&&url.searchParams.get('revision')===String(revision))return json(res,200,{unchanged:true});
      return json(res,200,{...d.view(),revision});
    }
    if(url.pathname==='/api/events'&&req.method==='GET'){
      const threadId=url.searchParams.get('threadId'),d=await selected(threadId);
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});
      const entry={res,threadId,admin:isAdmin(req),expires:isAdmin(req)?Infinity:sessions.get(token(req))};streams.add(entry);res.write(`data: ${JSON.stringify(d?.view()??await history(threadId))}\n\n`);res.on('close',()=>streams.delete(entry));return;
    }
    if(url.pathname==='/api/message'&&req.method==='POST'){
      const {text,threadId:id}=await body(req);if(typeof text!=='string'||!text.trim()||text.length>20000)return json(res,400,{error:'请输入 1–20000 字的消息'});
      const d=await selected(id);if(!d)throw Error('此任务尚未在 Desktop 加载，请先在电脑端打开它');
      return json(res,200,{ok:true,result:await d.message(text.trim())});
    }
    if(url.pathname==='/api/interrupt'&&req.method==='POST'){const {turnId,threadId:id}=await body(req);const d=await selected(id);if(!d)throw Error('任务未连接');return json(res,200,{ok:true,result:await d.interrupt(turnId)})}
    return json(res,404,{error:'Not found'});
  }catch(e){json(res,400,{error:e.message})}
});
const live=attachLive(server,{allowedHosts,
  authorize:(req,credential)=>{const request={headers:{...req.headers,authorization:'Bearer '+credential},socket:req.socket};return isAdmin(request)||authenticate(request)},
  getDesktop:selected,getHistory:history,
  command:async m=>{const d=await selected(m.threadId);if(!d)throw Error('此任务尚未在 Desktop 加载');
    if(m.action==='model'){const choice=modelChoice(await listModels(),m.model,d.view().reasoningEffort);return d.setModel(choice.model,choice.effort,await catalogProvider())}
    if(m.action==='permissions')return d.setPermissions(m);
    if(m.action==='message'){if(typeof m.text!=='string'||!m.text.trim()||m.text.length>20000)throw Error('请输入 1–20000 字的消息');return d.message(m.text.trim())}
    if(m.action==='interrupt')return d.interrupt(m.turnId);throw Error('Invalid action');}
});
rotate();
server.listen(port,'0.0.0.0',()=>{console.log(`Desktop pairing panel: http://127.0.0.1:${port}/admin#admin=${admin}`);console.log(`Phone origin: ${publicOrigin}`)});
const heartbeat=setInterval(()=>{for(const s of streams){if(s.expires<Date.now()){s.res.end();streams.delete(s)}else s.res.write(': keepalive\n\n')}for(const[k,v]of sessions)if(v<Date.now())sessions.delete(k);for(const[k,v]of attempts)if(v.until<Date.now())attempts.delete(k)},15000);
function shutdown(){clearInterval(heartbeat);live.close();for(const d of clients.values())d.close();for(const s of streams)s.res.end();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1000).unref()}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
