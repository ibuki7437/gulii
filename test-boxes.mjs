import assert from 'node:assert/strict';
import {BoxLibrary,BOXES_KEY,LEGACY_KEY} from './dist/boxes.js';
import {settle} from './dist/calc.js';
const fresh=()=>({version:1,name:'我的国际箱 · 01',orders:[],gross:'',fee:''});
const validate=b=>{if(b?.version!==1||typeof b.name!=='string'||!Array.isArray(b.orders))throw Error('invalid box');return b;};
class Storage{constructor(){this.map=new Map();this.fail=false;}getItem(k){return this.map.get(k)??null;}setItem(k,v){if(this.fail)throw Error('quota exceeded');this.map.set(k,v);}}
const legacy={version:1,name:'十月已称箱',orders:[{id:'o1',name:'实际订单',source:'原表.xlsx',items:[{id:'item',name:'吧唧',owners:[{cn:'甲',qty:2},{cn:'乙',qty:1}],weight:10,overrides:{甲:11}}],gross:40,mode:'item',personWeights:{},complete:true,deletedItems:[{item:{id:'deleted',name:'留存商品'}}],imageNotes:[{note:'保留备注'}]}],gross:50,fee:12.34};
const storage=new Storage();storage.setItem(LEGACY_KEY,JSON.stringify(legacy));const oldRaw=storage.getItem(LEGACY_KEY);
const a=new BoxLibrary(storage,validate,fresh);let first=a.active;const firstId=first.id;
assert.equal(a.list().length,1);assert.deepEqual(first.orders,legacy.orders);assert.equal(first.fee,legacy.fee);assert.equal(storage.getItem(LEGACY_KEY),oldRaw);assert.deepEqual(settle(first).rows.map(r=>r.fee),settle(legacy).rows.map(r=>r.fee));
first=a.saveBox({...first,name:'箱 A'});const aSnapshot=JSON.stringify(first);
let second=a.createBox('箱 B');const secondId=second.id;second=a.saveBox({...second,gross:88.88,fee:6.66});assert.equal(JSON.stringify(a.get(firstId)),aSnapshot);assert.equal(a.list().length,2);
const reload=new BoxLibrary(storage,validate,fresh);assert.equal(reload.active.id,secondId);assert.equal(reload.active.gross,88.88);assert.equal(reload.switchBox(firstId).name,'箱 A');
const backup=reload.backup(reload.active);assert.equal(backup.boxes.length,2);
const restored=new BoxLibrary(new Storage(),validate,fresh);const recovery=restored.restore(backup);assert.equal(recovery.count,2);assert.equal(restored.list().length,3);assert.notEqual(recovery.box.id,firstId);assert.deepEqual(recovery.box.orders,legacy.orders);assert.equal(restored.restore(legacy).count,1);assert.equal(restored.list().length,4);
const invalid=structuredClone(backup);invalid.boxes[1].version=99;const untouched=restored.storage.getItem(BOXES_KEY);assert.throws(()=>restored.restore(invalid));assert.equal(restored.storage.getItem(BOXES_KEY),untouched);
// A failed atomic write leaves saved boxes and the current selection unchanged.
storage.fail=true;const beforeQuota=storage.getItem(BOXES_KEY);assert.throws(()=>reload.createBox('不能保存的新箱'));assert.throws(()=>reload.saveBox({...reload.active,name:'不能保存的名字'}));assert.throws(()=>reload.restore(backup));assert.equal(storage.getItem(BOXES_KEY),beforeQuota);storage.fail=false;
// Distinct boxes edited in different tabs preserve each other's latest values.
const tab1=new BoxLibrary(storage,validate,fresh),tab2=new BoxLibrary(storage,validate,fresh);let v1=tab1.switchBox(firstId),v2=tab2.switchBox(secondId);v1=tab1.saveBox({...v1,name:'A 页的新名字'});v2=tab2.saveBox({...v2,name:'B 页的新名字'});assert.equal(tab2.get(firstId).name,v1.name);assert.equal(tab1.get(secondId).name,v2.name);
// A stale tab cannot overwrite the same box; backup keeps its unsaved copy separately.
const tab3=new BoxLibrary(storage,validate,fresh);let stale=tab3.switchBox(firstId);v1=tab1.saveBox({...v1,fee:9.99});stale.name='旧页面尚未保存';assert.throws(()=>tab3.saveBox(stale),/另一个页面/);assert.equal(tab1.get(firstId).name,'A 页的新名字');const conflictBackup=tab3.backup(stale);assert.equal(conflictBackup.boxes.length,3);assert.equal(conflictBackup.boxes.find(b=>b.id===firstId).fee,9.99);assert.ok(conflictBackup.boxes.some(b=>b.name.includes('未保存副本')));
// A quota failure during migration still exposes the original box and keeps legacy bytes.
const limited=new Storage();limited.setItem(LEGACY_KEY,oldRaw);limited.fail=true;const pending=new BoxLibrary(limited,validate,fresh);assert.deepEqual(pending.active.orders,legacy.orders);assert.ok(pending.warning);assert.equal(limited.getItem(LEGACY_KEY),oldRaw);limited.fail=false;pending.saveBox(pending.active);assert.ok(limited.getItem(BOXES_KEY));
// Corrupt collection data must not be silently replaced by an empty box.
const broken=new Storage();broken.setItem(BOXES_KEY,'{broken');assert.throws(()=>new BoxLibrary(broken,validate,fresh));assert.equal(broken.getItem(BOXES_KEY),'{broken');
console.log('PASS: legacy migration preserves all details and settlement; isolated boxes; reload; all-box/single-box restore; invalid restore atomicity; quota protection; separate-tab edits; stale same-box detection; conflict backup; corrupt data retained.');
