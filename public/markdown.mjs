import {marked} from './vendor/marked.esm.js';
import createDOMPurify from './vendor/purify.es.mjs';
import {setIcon} from './icons.mjs';

export function markdownHTML(text, windowObject=window){
  const purify=typeof createDOMPurify.sanitize==='function'?createDOMPurify:createDOMPurify(windowObject);
  return purify.sanitize(marked.parse(text,{gfm:true,breaks:true}),{
    ALLOWED_TAGS:['p','br','strong','em','del','code','pre','blockquote','ul','ol','li','h1','h2','h3','h4','h5','h6','hr','a','table','thead','tbody','tr','th','td'],
    ALLOWED_ATTR:['href','title','class','start'],
  });
}

export function renderMarkdown(element,text){
  element.innerHTML=markdownHTML(text);
  for(const link of element.querySelectorAll('a')){
    const href=link.getAttribute('href')??'';
    if(!/^https?:\/\//i.test(href)){link.removeAttribute('href');continue}
    link.target='_blank';link.rel='noopener noreferrer';
  }
  for(const pre of element.querySelectorAll('pre')){
    const code=pre.querySelector('code'),card=document.createElement('div'),bar=document.createElement('div');
    card.className='code-card';bar.className='code-bar';
    const language=document.createElement('span');language.textContent=code?.className.match(/language-([\w+-]+)/)?.[1]??'text';
    const wrap=document.createElement('button');wrap.type='button';wrap.className='icon-button';setIcon(wrap,'wrap');wrap.title='切换代码换行';wrap.setAttribute('aria-label','切换代码换行');wrap.setAttribute('aria-pressed','false');wrap.onclick=()=>{const on=pre.classList.toggle('wrap');wrap.setAttribute('aria-pressed',String(on))};
    const copy=document.createElement('button');copy.type='button';copy.className='icon-button';setIcon(copy,'copy');copy.title='复制代码';copy.setAttribute('aria-label','复制代码');copy.onclick=async()=>{try{await navigator.clipboard.writeText(code?.textContent??pre.textContent);setIcon(copy,'check');setTimeout(()=>setIcon(copy,'copy'),1200)}catch{copy.title='复制失败，请选择代码手动复制'}};
    bar.append(language,wrap,copy);pre.replaceWith(card);card.append(bar,pre);
  }
  for(const table of element.querySelectorAll('table')){const container=document.createElement('div');container.className='table-scroll';table.replaceWith(container);container.append(table)}
}
