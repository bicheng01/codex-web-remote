import{readFile}from'node:fs/promises';import path from'node:path';
export async function serveAsset(req,res,pathname,root){
 if(!/^\/assets\/(?:app|style)-[a-f0-9]{12}\.(?:js|css)$/.test(pathname))return false;
 const accepted=String(req.headers['accept-encoding']??'').split(',').map(x=>x.trim()).filter(x=>!/(?:;\s*q=0(?:\.0*)?$)/.test(x)).map(x=>x.split(';')[0]);
 const encoding=accepted.includes('br')?'br':accepted.includes('gzip')?'gzip':null;
 try{const body=await readFile(path.join(root,'public',pathname.slice(1))+(encoding==='br'?'.br':encoding==='gzip'?'.gz':''));res.setHeader('Content-Type',pathname.endsWith('.js')?'text/javascript':'text/css');res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.setHeader('Vary','Accept-Encoding');if(encoding)res.setHeader('Content-Encoding',encoding);res.end(body)}catch{res.writeHead(404,{'Cache-Control':'no-store'});res.end('Not found')}
 return true;
}
