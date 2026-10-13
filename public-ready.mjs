const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function verifyPublicPage(origin,{fetchPage=fetch,signal}={}){
  const get=async(path,type)=>{const response=await fetchPage(new URL(path,origin),{signal});if(!response.ok)throw Error(`公网资源尚未就绪（HTTP ${response.status}）`);if(!response.headers.get('content-type')?.includes(type))throw Error('公网资源类型不正确');return response.text()};
  const html=await get('/','text/html');
  if(!html.includes('<title>Codex 远程控制</title>'))throw Error('公网页面不正确');
  const assets=[...html.matchAll(/(?:src|href)="(\/assets\/(?:app|style)-[a-f0-9]{12}\.(?:js|css))"/g)].map(m=>m[1]);
  if(!assets.some(p=>p.endsWith('.js'))||!assets.some(p=>p.endsWith('.css')))throw Error('公网页面缺少应用资源');
  await Promise.all(assets.map(async path=>{const body=await get(path,path.endsWith('.js')?'javascript':'text/css');if(!body.trim())throw Error('公网资源为空')}));
}
export async function waitPublicPage(origin,{timeoutMs=40000,attemptMs=6000,fetchPage=fetch,signal,onRetry=()=>{}}={}){
  const deadline=Date.now()+timeoutMs;let last;
  while(Date.now()<deadline){signal?.throwIfAborted();try{await verifyPublicPage(origin,{fetchPage,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(Math.min(attemptMs,deadline-Date.now()))]):AbortSignal.timeout(Math.min(attemptMs,deadline-Date.now()))});return}catch(e){signal?.throwIfAborted();last=e;onRetry(e);if(Date.now()<deadline)await delay(Math.min(1000,deadline-Date.now()))}}
  throw Error('公网页面未能就绪：'+(last?.message??'超时'));
}
