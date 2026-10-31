import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';
import {parseWorkbook} from './dist/calc.js';
import {aggregateWorkbook,summaryWorkbook} from './dist/cn-summary.js';
import {gridToEntries,entriesToOrder,cleanCN} from './dist/image-data.js';
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/xlsx.full.min.js','utf8'),ctx);const X=ctx.XLSX;
const wb=X.utils.book_new();
for(const [name,a,b] of [['分类甲',2,1],['分类乙',3,2]]){
  const rows=[['合成测试表'],['','分类',name],['','种类','角色甲吧唧','角色乙卡片'],['','单价',1,1],['总金额','昵称/总数',a+b,1],['','测试团员甲',a,1],['','测试团员乙',b,'']];
  X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(rows),name);
}
const orders=parseWorkbook(wb,'合成测试.xlsx',X);assert.equal(orders.length,2);assert.equal(orders[0].items[0].owners[0].qty,2);
const result=aggregateWorkbook(wb,X);assert.equal(result.products.length,2);assert.equal(result.names.length,2);assert.equal(result.total,10);
const output=summaryWorkbook(result,X,'合成汇总');assert.equal(parseWorkbook(output,'汇总.xlsx',X)[0].items.length,2);
const invalid=X.read(X.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});invalid.Sheets['分类甲'].C6.v=-1;assert.throws(()=>aggregateWorkbook(invalid,X));
const grid=[['','角色甲','角色乙'],['1','测试团员甲','测试团员乙（赠）'],['2','测试团员甲','测试团员乙']];
const parsed=gridToEntries(grid,['header','owners','owners'],{prefix:'合成商品'});assert.equal(parsed.entries.reduce((s,e)=>s+e.qty,0),4);
const imageOrder=entriesToOrder({entries:parsed.entries,name:'合成图片排表',source:'合成.png',draftId:'test'});assert.equal(imageOrder.items.length,2);assert.equal(imageOrder.complete,false);assert.equal(cleanCN('测试团员乙（赠）').cn,'测试团员乙');
console.log('PASS synthetic Excel import, CN merge, invalid quantities, image-grid conversion and gift CN handling');
