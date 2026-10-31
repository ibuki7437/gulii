import assert from 'node:assert/strict';
import {BoxLibrary,BOXES_KEY} from './dist/boxes.js';
import {boxesForQuery,queryMember} from './dist/member-query.js';
import {settle} from './dist/calc.js';
class Storage{data=new Map();fail=false;getItem(k){return this.data.get(k)??null;}setItem(k,v){if(this.fail)throw Error('quota');this.data.set(k,v);}}
const storage=new Storage(),fresh=()=>({version:1,name:'新箱',orders:[],gross:'',fee:''}),validate=b=>{assert.equal(b.version,1);return b;};
const lib=new BoxLibrary(storage,validate,fresh);let a=lib.active;
a=lib.saveBox({...a,orders:[{id:'o',name:'订单',source:'排表.xlsx',gross:30,complete:true,items:[{id:'i',name:'吧唧',owners:[{cn:'甲',qty:2}],weight:10}]}],gross:40,fee:12.34});
const original=structuredClone(a),fees=settle(a),b=lib.createBox('第二箱');lib.switchBox(a.id);
const selected=lib.setArchived(a.id,true,a.revision);assert.equal(selected.id,b.id);const archived=lib.get(a.id);assert.equal(archived.archived,true);assert.ok(archived.archivedAt);assert.deepEqual(archived.orders,original.orders);assert.deepEqual(settle(archived),fees);
assert.equal(boxesForQuery(lib.list()).length,1);assert.equal(queryMember(boxesForQuery(lib.list()),'甲').qty,0);assert.equal(queryMember(boxesForQuery(lib.list(),true),'甲').qty,2);assert.equal(queryMember(lib.list(),'甲').boxes[0].archived,true);
const reload=new BoxLibrary(storage,validate,fresh);assert.equal(reload.active.id,b.id);assert.equal(reload.get(a.id).archived,true);assert.throws(()=>reload.saveBox({...original,name:'旧页误覆盖'}),/另一个页面/);assert.throws(()=>reload.setArchived(a.id,false,original.revision),/另一个页面/);
const backup=reload.backup(reload.active);assert.equal(backup.boxes.find(x=>x.id===a.id).archived,true);const restored=new BoxLibrary(new Storage(),validate,fresh);restored.restore(backup);assert.equal(restored.list().filter(x=>x.archived).length,1);
storage.fail=true;const raw=storage.getItem(BOXES_KEY);assert.throws(()=>reload.setArchived(a.id,false,archived.revision));assert.equal(storage.getItem(BOXES_KEY),raw);assert.equal(reload.active.id,b.id);storage.fail=false;
reload.setArchived(b.id,true,b.revision);assert.equal(reload.active.id,b.id);assert.ok(reload.active.archived);assert.equal(boxesForQuery(reload.list()).length,0);
const current=reload.setArchived(a.id,false,archived.revision);assert.equal(current.id,b.id);assert.equal(reload.get(a.id).archived,false);assert.equal(reload.get(a.id).archivedAt,null);assert.deepEqual(reload.get(a.id).orders,original.orders);
const newBox=reload.createBox('归档后新建');assert.ok(!newBox.archived);assert.equal(boxesForQuery(reload.list()).length,2);
console.log('PASS archive/unarchive: retained data and exact fees, switch current, all archived, reload, backup restore, query scope, stale-tab protection, quota atomicity, new box');
