export function suggestRowType(cells){
  const first=String(cells[0]??'').trim(),joined=cells.join('');
  if(/袋子|袋装|购物袋/.test(first))return 'bag';
  if(/^\d{1,3}[|.,]?$/.test(first)||/^[Il|]$/.test(first))return 'owners';
  const terms=['一织','大和','三月','壮五','nagi','momo','yuki','陆','乐','天','龙','环','猪','狗','蛇','虎'];
  if(terms.filter(t=>joined.toLowerCase().includes(t)).length>=3)return 'header';
  return 'ignore';
}
export function suggestRowTypes(grid){
  let seenHeader=false;
  return grid.map(row=>{let type=suggestRowType(row);if(type==='header')seenHeader=true;
    if(type==='ignore'&&seenHeader&&row.slice(1).filter(v=>String(v??'').trim()).length>=Math.max(2,Math.ceil((row.length-1)*.65)))type='owners';
    return type;
  });
}
export function cleanCN(value){
  const original=String(value??'').trim();
  const gift=/[（(]\s*赠(?:品)?\s*[）)]\s*$/.test(original);
  return {cn:original.replace(/[（(]\s*赠(?:品)?\s*[）)]\s*$/,'').trim(),note:gift?'赠品（计入数量与重量）':''};
}
export function gridToEntries(grid,types,{skipFirst=true,prefix=''}={}){
  let headers=null;const entries=[],warnings=[];
  const offset=skipFirst?1:0;
  for(let r=0;r<grid.length;r++){
    const type=types[r],row=grid[r];
    if(type==='header'){headers=row.map(v=>String(v??'').trim());continue;}
    if(type!=='owners'&&type!=='bag'){if(r>0&&row.filter(v=>String(v??'').trim()).length>2)warnings.push(`第 ${r+1} 行设为忽略，但含有文字，请确认没有漏掉商品。`);continue;}
    if(type==='owners'&&!headers){warnings.push(`第 ${r+1} 行前没有商品表头，请补充商品名称。`);}
    for(let col=offset;col<row.length;col++){
      const text=String(row[col]??'').trim();if(!text||/^[-—/]+$/.test(text))continue;
      const {cn,note}=cleanCN(text);if(!cn)continue;
      const label=type==='bag'?'袋子':headers?.[col]??'';
      const product=label?(prefix?prefix+'·':'')+label:'';
      const key=product+'\u0000'+cn+'\u0000'+note;
      const existing=entries.find(e=>e.key===key);
      if(existing){existing.qty++;existing.sources.push(`${r+1}-${col+1}`);}
      else entries.push({key,product,cn,qty:1,note,sources:[`${r+1}-${col+1}`]});
    }
  }
  return {entries,warnings};
}
export function validateEntries(entries){
  if(!Array.isArray(entries)||!entries.length)throw Error('没有可导入的商品明细，请补充商品、CN 和数量');
  if(entries.length>5000)throw Error('明细过多，请分成多张图片处理');
  for(const [i,e] of entries.entries()){
    if(!String(e.product??'').trim())throw Error(`第 ${i+1} 行缺少商品名称`);
    if(!String(e.cn??'').trim())throw Error(`第 ${i+1} 行缺少归属 CN`);
    if(!Number.isSafeInteger(Number(e.qty))||Number(e.qty)<=0)throw Error(`第 ${i+1} 行数量须为大于 0 的整数`);
  }
}
export function entriesToOrder({entries,name,source,draftId,sourceHash}){
  validateEntries(entries);
  if(!String(name??'').trim())throw Error('请填写订单名称');
  const items=[];
  for(const e of entries){
    const product=e.product.trim(),cn=e.cn.trim(),qty=Number(e.qty);
    let item=items.find(i=>i.name===product);
    if(!item){item={id:crypto.randomUUID(),name:product,weight:'',owners:[],overrides:{}};items.push(item);}
    let owner=item.owners.find(a=>a.cn===cn);if(owner)owner.qty+=qty;else item.owners.push({cn,qty});
  }
  return {id:crypto.randomUUID(),name:name.trim(),source,items,gross:'',mode:'item',personWeights:{},complete:false,imageDraftId:draftId,imageSourceHash:sourceHash,imageNotes:entries.filter(e=>e.note).map(e=>({product:e.product,cn:e.cn,qty:Number(e.qty),note:e.note}))};
}
