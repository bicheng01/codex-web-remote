export function stateFrame(previous,next){
  if(!previous)return {type:'snapshot',state:next};
  const before=new Map(previous.items.map(i=>[i.id,JSON.stringify(i)]));
  const changed=next.items.filter(i=>before.get(i.id)!==JSON.stringify(i));
  const {items,...metadata}=next;
  const order=items.map(i=>i.id),oldOrder=previous.items.map(i=>i.id);
  return {type:'delta',metadata,changed,...(JSON.stringify(order)!==JSON.stringify(oldOrder)?{order}:{})};
}
export function applyStateFrame(previous,frame){
  if(frame.type==='snapshot')return frame.state;
  if(frame.type!=='delta'||!previous)throw Error('State snapshot required');
  const items=new Map(previous.items.map(i=>[i.id,i]));
  for(const i of frame.changed)items.set(i.id,i);
  const order=frame.order??previous.items.map(i=>i.id);
  if(order.some(id=>!items.has(id)))throw Error('Missing state item');
  return {...frame.metadata,items:order.map(id=>items.get(id))};
}
