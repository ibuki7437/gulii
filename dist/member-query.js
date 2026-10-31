import {orderNote} from './order-notes.js';
import {hasWeight,orderCalc,settle} from './calc.js';
import {unitWeight} from './weights.js';
export const boxesForQuery=(boxes,includeArchived=false)=>boxes.filter(b=>includeArchived||!b.archived);

export function allCNs(boxes){return [...new Set(boxes.flatMap(b=>b.orders.flatMap(o=>o.items.flatMap(i=>i.owners.map(a=>a.cn)))))].sort((a,b)=>a.localeCompare(b,'zh-CN'));}
export function queryMember(boxes,cn){
  const found=[];const combined=new Map();
  for(const b of boxes){
    const orders=[];const items=[];
    for(const o of b.orders){
      const own=[];
      for(const i of o.items){
        const qty=i.owners.filter(a=>a.cn===cn).reduce((s,a)=>s+a.qty,0);if(!qty)continue;
        const raw=unitWeight(i,cn),unit=o.mode!=='person'&&hasWeight(raw)?Number(raw):null;
        const row={boxId:b.id,box:b.name,orderId:o.id,order:o.name,product:i.name,qty,unit,net:unit===null?null:unit*qty,mode:o.mode==='person'?'按人合称':'按商品',source:o.source||'',note:[...new Set((o.imageNotes||[]).filter(n=>n.cn===cn&&n.product===i.name&&n.note).map(n=>n.note))].join('；')};
        own.push(row);items.push(row);
        const key=i.name.trim();let sum=combined.get(key);if(!sum){sum={product:key,qty:0,boxes:new Set(),knownNet:0,missing:false};combined.set(key,sum);}sum.qty+=qty;sum.boxes.add(b.id);if(row.net===null)sum.missing=true;else sum.knownNet+=row.net;
      }
      if(!own.length)continue;
      const c=orderCalc(o),isPerson=o.mode==='person',net=isPerson?(hasWeight(o.personWeights?.[cn])?Number(o.personWeights[cn]):null):(own.every(r=>r.net!==null)?own.reduce((s,r)=>s+r.net,0):null);
      const verified=!!o.complete&&!c.error,a=verified?c.allocated[cn]:null;
      orders.push({note:orderNote(o),order:o.name,orderId:o.id,qty:own.reduce((s,r)=>s+r.qty,0),net,pack:a?.pack??null,d:a?.d??null,status:c.error||(!o.complete?'待确认完成称重':'已完成称重')});
    }
    if(!items.length)continue;
    let shipping=null,reason='';try{shipping=settle(b).rows.find(r=>r.cn===cn)??null;}catch(e){reason=e.message;}
    found.push({id:b.id,name:b.name,archived:!!b.archived,items,orders,qty:items.reduce((s,r)=>s+r.qty,0),shipping,reason});
  }
  return {cn,boxes:found,combined:[...combined.values()].map(r=>({...r,boxCount:r.boxes.size,boxes:undefined,net:r.missing?null:r.knownNet})),qty:found.reduce((s,b)=>s+b.qty,0),orderCount:found.reduce((s,b)=>s+b.orders.length,0),cents:found.reduce((s,b)=>s+(b.shipping?.cents??0),0),pending:found.filter(b=>!b.shipping).length};
}
export function memberWorkbook(report,XLSX){
  const wb=XLSX.utils.book_new(),n=v=>v===null||v===undefined?'':v;
  const sheet=(name,rows,widths)=>{const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=widths.map(wch=>({wch}));ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:rows.length-1,c:rows[0].length-1}})};for(const cell of Object.values(ws))if(cell?.t==='n'&&!Number.isInteger(cell.v))cell.z='0.00';XLSX.utils.book_append_sheet(wb,ws,name);};
  sheet('商品总列表',[['CN','商品名称','总数量','所在箱数','商品重（克）','重量说明'],...report.combined.map(r=>[report.cn,r.product,r.qty,r.boxCount,n(r.net),r.missing?'未逐件称全，详见订单重量':'按单件重量汇总'])],[26,36,12,12,18,38]);
  sheet('分箱商品明细',[['CN','箱子','箱子编号','订单','订单编号','商品名称','数量','单件克重','商品重（克）','称重方式','重量说明','来源表格','备注'],...report.boxes.flatMap(b=>b.items.map(r=>[report.cn,b.name,b.id,r.order,r.orderId,r.product,r.qty,n(r.unit),n(r.net),r.mode,r.net===null?(r.mode==='按人合称'?'参见订单重量明细':'待称重'):'已录入单件重量',r.source,r.note]))],[26,26,38,26,38,36,10,14,16,14,26,32,32]);
  sheet('订单重量明细',[['CN','箱子','箱子编号','订单','订单编号','数量','本人商品重（克）','订单包装分摊（克）','含订单包装重（克）','状态','订单备注'],...report.boxes.flatMap(b=>b.orders.map(o=>[report.cn,b.name,b.id,o.order,o.orderId,o.qty,n(o.net),n(o.pack),n(o.d),o.status,o.note]))],[26,26,38,26,38,10,22,24,24,34,48]);
  sheet('分箱运费',[['CN','箱子','箱子编号','订单数','件数','商品重（克）','订单包装（克）','箱重分摊（克）','最终重量（克）','运费（元）','状态','归档状态'],...report.boxes.map(b=>{const s=b.shipping;return [report.cn,b.name,b.id,b.orders.length,b.qty,n(s?.net),n(s?.pack),n(s?.box),n(s?.g),n(s?.fee),s?'按当前数据可结算':b.reason,b.archived?'已归档':'使用中'];}),[report.cn,'合计','',report.orderCount,report.qty,'','','','',report.cents/100,report.pending?`仅含可结算箱子；另有 ${report.pending} 箱待结算`:'全部箱子可结算','']],[26,26,38,12,12,18,18,20,20,18,48,16]);
  return wb;
}
