import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';
import {allCNs,queryMember,memberWorkbook} from './dist/member-query.js';
import {settle} from './dist/calc.js';
const order=(id,qty=2)=>({id,name:id,source:'原表.xlsx',mode:'item',complete:true,gross:40,items:[{id:'i',name:'纪念吧唧',weight:10,owners:[{cn:'甲',qty},{cn:'甲乙',qty:1}],overrides:{甲:11}}]});
const a={id:'a',name:'同名箱',orders:[order('o1')],gross:50,fee:.01};
const b={id:'b',name:'同名箱',orders:[order('o2',1)],gross:60,fee:0};
const c={id:'c',name:'未完成箱',orders:[{...order('o3'),mode:'person',personWeights:{甲:25},complete:false}],gross:'',fee:''};
const input=[a,b,c],snapshot=JSON.stringify(input),r=queryMember(input,'甲');
assert.deepEqual(allCNs(input),['甲','甲乙']);assert.equal(r.boxes.length,3);assert.equal(r.qty,5);assert.equal(r.combined.length,1);assert.equal(r.combined[0].qty,5);assert.equal(r.combined[0].boxCount,3);assert.equal(r.combined[0].net,null);assert.equal(r.pending,1);assert.equal(r.cents,settle(a).rows.find(x=>x.cn==='甲').cents);assert.equal(r.boxes[1].shipping.fee,0);assert.equal(r.boxes[2].items[0].net,null);assert.equal(r.boxes[2].orders[0].net,25);assert.equal(r.boxes[2].orders[0].pack,null);assert.equal(queryMember(input,'不存在').qty,0);assert.equal(JSON.stringify(input),snapshot);
const missing=structuredClone(a);missing.orders[0].items[0].overrides.甲=null;assert.equal(queryMember([missing],'甲').boxes[0].orders[0].net,null);
const dup=structuredClone(a);dup.orders[0].items[0].owners.push({cn:'甲',qty:3});assert.equal(queryMember([dup],'甲').qty,5);
const deleted=structuredClone(a);deleted.orders[0].deletedItems=[{item:{name:'删除品',owners:[{cn:'甲',qty:99}]}}];assert.equal(queryMember([deleted],'甲').qty,2);
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/xlsx.full.min.js','utf8'),ctx);const XLSX=ctx.XLSX;
const wb=memberWorkbook(r,XLSX);assert.equal(wb.SheetNames.length,4);const bytes=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});const read=XLSX.read(bytes,{type:'buffer'});const detail=XLSX.utils.sheet_to_json(read.Sheets['分箱商品明细']);assert.equal(detail.length,3);assert.equal(detail[0]['数量'],2);assert.equal(detail[2]['单件克重'],'');assert.equal(detail[0]['单件克重'],11);const fees=XLSX.utils.sheet_to_json(read.Sheets['分箱运费']);assert.equal(fees[1]['运费（元）'],0);assert.equal(fees[2]['运费（元）'],'');assert.match(fees[3]['状态'],/仅含可结算/);
console.log('PASS cross-box CN query: exact names, box IDs, quantities, weights, missing data, zero fee, cents, no mutation, Excel roundtrip');

