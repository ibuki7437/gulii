export const hasWeight = v => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) > 0;
export function members(order) {
  return [...new Set(order.items.flatMap(i=>i.owners.map(o=>o.cn)))];
}
export function orderCalc(order) {
  const people = Object.fromEntries(members(order).map(cn=>[cn,0]));
  let missing = 0;
  if(order.mode==='person') {
    for(const cn of Object.keys(people)) { const w=order.personWeights?.[cn]; if(!hasWeight(w)) missing++; else people[cn]=Number(w); }
  } else {
    for(const item of order.items) for(const owner of item.owners) {
      const override=item.overrides?.[owner.cn];
      const unit=override!==undefined && override!=='' ? override : item.weight;
      if(!hasWeight(unit)) missing+=owner.qty;
      else people[owner.cn]+=Number(unit)*owner.qty;
    }
  }
  const net=Object.values(people).reduce((a,b)=>a+b,0), gross=Number(order.gross);
  const error=!order.items.length?'订单没有商品，请添加商品或移除此订单':missing?'还有未称重记录':!hasWeight(order.gross)?'请填写订单总重':gross+1e-8<net?'订单总重小于商品总重':null;
  const packaging=error?null:Math.max(0,gross-net);
  return {people,net,missing,gross,packaging,error, allocated:error?{}:Object.fromEntries(Object.entries(people).map(([cn,b])=>[cn,{net:b,pack:packaging*b/net,d:gross*b/net}]))};
}
export function settle(box) {
  if(!box.orders.length) throw Error('请先导入订单');
  const people=Object.create(null),details=[];
  for(const o of box.orders) {
    const c=orderCalc(o);
    if(c.error||!o.complete) throw Error('请先完成所有订单称重');
    for(const [cn,v] of Object.entries(c.allocated)) {
      if(!people[cn])people[cn]={cn,net:0,pack:0,d:0};
      for(const k of ['net','pack','d'])people[cn][k]+=v[k];
      details.push({order:o.name,cn,...v});
    }
  }
  const d=Object.values(people).reduce((s,p)=>s+p.d,0),e=Number(box.gross),price=Number(box.fee);
  if(!hasWeight(box.gross))throw Error('请填写整箱重量');
  if(e+1e-8<d)throw Error('整箱重量小于所有订单总重之和');
  if(box.fee===''||!Number.isFinite(price)||price<0)throw Error('请填写有效的总国际运费');
  if(Math.abs(price*100-Math.round(price*100))>1e-6)throw Error('总国际运费最多保留两位小数');
  const cents=Math.round(price*100),f=Math.max(0,e-d);
  const rows=Object.values(people).map(p=>{const exact=cents*p.d/d;return {...p,box:f*p.d/d,g:e*p.d/d,exact,cents:Math.floor(exact),remainder:exact-Math.floor(exact)};});
  const ranked=[...rows].sort((a,b)=>b.remainder-a.remainder||a.cn.localeCompare(b.cn,'zh-CN'));
  let left=cents-rows.reduce((s,p)=>s+p.cents,0);
  for(let i=0;i<left;i++)ranked[i%ranked.length].cents++;
  for(const p of rows){p.fee=p.cents/100;p.adjustment=(p.cents-Math.round(p.exact))/100;}
  rows.sort((a,b)=>a.cn.localeCompare(b.cn,'zh-CN'));
  return {rows,details,d,e,f,price,rate:price/e};
}
export function parseWorkbook(wb,fileName,XLSX) {
  const orders=[];
  for(const sheetName of wb.SheetNames) {
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:'',raw:true});
    const header=rows.findIndex(r=>r[1]==='种类');
    if(header<0)continue;
    const peopleRow=rows.findIndex((r,i)=>i>header&&String(r[1]).includes('昵称/总数'));
    if(peopleRow<0)throw Error('未找到昵称/总数行');
    const classification=rows.slice(0,header).find(r=>r[1]==='分类');
    const items=[];
    for(let col=2;col<rows[header].length;col++) {
      const name=String(rows[header][col]??'').trim();if(!name)continue;
      const owners=[];
      for(let r=peopleRow+1;r<rows.length;r++) {
        const cn=String(rows[r][1]??'').trim(),raw=rows[r][col];
        if(raw===''||raw===null)continue;
        const qty=Number(raw);
        if(!Number.isFinite(qty)||qty<0||!Number.isInteger(qty))throw Error('数量异常：'+name+'，第 '+(r+1)+' 行');
        if(qty>0){if(!cn)throw Error('存在缺少 CN 的商品记录');owners.push({cn,qty});}
      }
      const expected=Number(rows[peopleRow][col]),actual=owners.reduce((s,o)=>s+o.qty,0);
      if(rows[peopleRow][col]!==''&&Number.isFinite(expected)&&expected!==actual)throw Error('数量合计不一致：'+name);
      if(owners.length)items.push({id:'col-'+col,name,owners,weight:'',overrides:{}});
    }
    if(items.length)orders.push({id:crypto.randomUUID(),name:String(classification?.[2]||sheetName||fileName),source:fileName,items,gross:'',mode:'item',personWeights:{},complete:false});
  }
  if(!orders.length)throw Error('未识别到排表，请使用含“种类”和“昵称/总数”的原始汇总表');
  return orders;
}
