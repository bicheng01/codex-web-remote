import{build}from'esbuild';import{readFile,writeFile,mkdir}from'node:fs/promises';import{createHash}from'node:crypto';import{brotliCompressSync,gzipSync,constants}from'node:zlib';
const result=await build({entryPoints:['public/app.js'],bundle:true,minify:true,format:'esm',target:'es2022',write:false});
await mkdir('public/assets',{recursive:true});
function portableGzip(data){const compressed=gzipSync(data,{level:9});compressed[9]=255;return compressed}
async function asset(prefix,extension,data){const hash=createHash('sha256').update(data).digest('hex').slice(0,12),file=`${prefix}-${hash}.${extension}`,base='public/assets/'+file;await writeFile(base,data);await writeFile(base+'.gz',portableGzip(data));await writeFile(base+'.br',brotliCompressSync(data,{params:{[constants.BROTLI_PARAM_QUALITY]:11}}));return'/assets/'+file}
const app=await asset('app','js',result.outputFiles[0].contents),css=await asset('style','css',await readFile('public/style.css'));
const html=await readFile('public/index.html','utf8');await writeFile('public/index.html',html.replace(/href="(?:\/style\.css|\/assets\/style-[a-f0-9]+\.css)"/,`href="${css}"`).replace(/src="(?:\/app\.js|\/assets\/app-[a-f0-9]+\.js)"/,`src="${app}"`));
console.log(JSON.stringify({app,css,bundleBytes:result.outputFiles[0].contents.length,brotliBytes:brotliCompressSync(result.outputFiles[0].contents).length}));
