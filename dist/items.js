import {hasWeight} from './calc.js';

export function renameItem(order,itemId,newName) {
  const name=String(newName??'').trim();
  if(!name)throw Error('请填写商品名称');
  if(name.length>300)throw Error('商品名称最多 300 个字符');
  const item=order.items.find(i=>i.id===itemId);
  if(!item)throw Error('商品不存在，请重新打开订单');
  item.name=name;
}

function invalidate(order, affected) {
  order.complete=false;
  // A person's previous combined weight no longer describes the changed goods.
  for(const cn of affected) if(order.personWeights) delete order.personWeights[cn];
}

export function upsertItem(order,draft,itemId) {
  const name=String(draft.name??'').trim();
  if(!name)throw Error('请填写商品名称');
  const weight=draft.weight??'';
  if(weight!==''&&!hasWeight(weight))throw Error('单件重量须大于 0，未称重可以留空');
  if(!Array.isArray(draft.owners)||!draft.owners.length)throw Error('请至少填写一位归属团员');
  const seen=new Set();
  const owners=draft.owners.map(a=>{
    const cn=String(a.cn??'').trim(),qty=Number(a.qty);
    if(!cn)throw Error('请填写每一行的归属 CN');
    if(!Number.isSafeInteger(qty)||qty<=0)throw Error('数量须为大于 0 的整数');
    if(seen.has(cn))throw Error('同一商品的 CN 不能重复，请合并数量');
    seen.add(cn);return {cn,qty};
  });
  const index=itemId?order.items.findIndex(i=>i.id===itemId):-1;
  if(itemId&&index<0)throw Error('商品不存在，请重新打开订单');
  const old=index<0?null:order.items[index];
  const overrides=Object.fromEntries(Object.entries(old?.overrides??{}).filter(([cn])=>seen.has(cn)));
  const item={...old,id:old?.id??crypto.randomUUID(),name,owners,weight,overrides,manual:old?.manual??!old};
  if(index<0)order.items.push(item);else order.items[index]=item;
  invalidate(order,new Set([...owners,...(old?.owners??[])].map(a=>a.cn)));
  return item;
}

export function deleteItem(order,itemId) {
  const index=order.items.findIndex(i=>i.id===itemId);
  if(index<0)throw Error('商品不存在');
  const [item]=order.items.splice(index,1);
  order.deletedItems??=[];
  order.deletedItems.push({item,index});
  invalidate(order,item.owners.map(a=>a.cn));
}

export function restoreItem(order,itemId) {
  const index=order.deletedItems?.findIndex(v=>v.item.id===itemId)??-1;
  if(index<0)throw Error('找不到已删除商品');
  const entry=order.deletedItems[index];
  if(order.items.some(i=>i.id===itemId))throw Error('商品已存在，不能重复恢复');
  order.deletedItems.splice(index,1);
  order.items.splice(Math.min(entry.index,order.items.length),0,entry.item);
  invalidate(order,entry.item.owners.map(a=>a.cn));
}
