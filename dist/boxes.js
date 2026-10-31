export const BOXES_KEY='gutuan-boxes-v2',LEGACY_KEY='gutuan-v1';
const clone=v=>JSON.parse(JSON.stringify(v));
export class BoxLibrary{
  constructor(storage,validate,fresh){
    this.storage=storage;this.validate=validate;this.fresh=fresh;this.warning='';this.persisted=false;
    const raw=storage.getItem(BOXES_KEY);
    if(raw!==null){this.initial=this.checkDocument(JSON.parse(raw));this.persisted=true;}
    else{
      const legacy=storage.getItem(LEGACY_KEY),box=this.makeBox(legacy===null?fresh():validate(JSON.parse(legacy)));
      this.initial={version:2,activeId:box.id,boxes:[box]};
      try{this.write(this.initial);}catch{this.warning='当前进度已读取，但浏览器暂时无法保存多箱数据。请先导出备份。';}
    }
    this.activeId=this.initial.activeId;this.active=clone(this.initial.boxes.find(b=>b.id===this.activeId));
  }
  makeBox(value){return {...clone(this.validate(value)),id:crypto.randomUUID(),revision:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
  checkDocument(doc){
    if(doc?.version!==2||!Array.isArray(doc.boxes)||!doc.boxes.length)throw Error('多箱备份格式不正确');
    const ids=new Set();
    for(const box of doc.boxes){this.validate(box);if(typeof box.id!=='string'||!box.id||ids.has(box.id)||!Number.isSafeInteger(box.revision)||box.revision<0)throw Error('箱子标识或保存版本不正确');ids.add(box.id);}
    if(!ids.has(doc.activeId))throw Error('当前箱子不存在');return doc;
  }
  read(){const raw=this.storage.getItem(BOXES_KEY);if(raw===null){if(!this.persisted)return clone(this.initial);throw Error('本地多箱数据已在其他页面被清除，请先导出当前进度再刷新');}return this.checkDocument(JSON.parse(raw));}
  write(doc){this.storage.setItem(BOXES_KEY,JSON.stringify(doc));this.persisted=true;this.warning='';}
  list(){return clone(this.read().boxes);}
  get(id){const box=this.read().boxes.find(b=>b.id===id);if(!box)throw Error('没有找到这个箱子');return clone(box);}
  setArchived(id,archived,revision){
    const db=this.read(),b=db.boxes.find(b=>b.id===id);if(!b)throw Error('没有找到这个箱子');
    if(b.revision!==revision)throw Error('此箱已在另一个页面更新，请刷新箱子列表后重试。');
    const flag=!!archived;if(!!b.archived===flag)return clone(this.active);
    b.archived=flag;b.archivedAt=flag?new Date().toISOString():null;b.revision++;b.updatedAt=new Date().toISOString();
    // Keep this page's selection; another page may be working on a different box.
    let selected=db.boxes.find(v=>v.id===this.activeId);
    if(selected.id===id&&flag)selected=db.boxes.find(v=>!v.archived)||selected;
    db.activeId=selected.id;this.write(db);this.activeId=selected.id;this.active=clone(selected);return clone(selected);
  }
  saveBox(value){
    this.validate(value);const db=this.read(),index=db.boxes.findIndex(b=>b.id===value.id);
    if(index<0)throw Error('当前箱子不在保存列表中，请先导出当前进度再刷新');
    const content=box=>{const {revision,updatedAt,...data}=box;return JSON.stringify(data);};
    if(content(value)===content(db.boxes[index])){
      if(!this.persisted)this.write(db);
      this.activeId=value.id;this.active=clone(db.boxes[index]);return clone(this.active);
    }
    if(db.boxes[index].revision!==value.revision)throw Error('此箱已在另一个页面更新。请先导出全部备份，再刷新，避免覆盖新进度。');
    const saved={...clone(value),revision:value.revision+1,updatedAt:new Date().toISOString()};db.boxes[index]=saved;db.activeId=value.id;
    this.write(db);this.activeId=saved.id;this.active=clone(saved);return clone(saved);
  }
  switchBox(id){const db=this.read(),selected=db.boxes.find(b=>b.id===id);if(!selected)throw Error('没有找到这个箱子');db.activeId=id;this.write(db);this.activeId=id;this.active=clone(selected);return clone(selected);}
  createBox(name){if(!String(name).trim())throw Error('请填写箱子名称');const db=this.read(),created=this.makeBox({...this.fresh(),name:String(name).trim()});db.boxes.push(created);db.activeId=created.id;this.write(db);this.activeId=created.id;this.active=clone(created);return clone(created);}
  restore(payload){
    let originals,activeIndex=0;
    if(payload?.version===2){const doc=this.checkDocument(payload);originals=doc.boxes;activeIndex=originals.findIndex(b=>b.id===doc.activeId);}
    else{originals=[this.validate(payload)];}
    // Validate and prepare everything before the one storage write; existing boxes stay intact.
    const db=this.read(),names=new Set(db.boxes.map(b=>b.name));
    const incoming=originals.map(original=>{const b=this.makeBox(original),base=b.name||'恢复的箱子';let name=base,n=1;while(names.has(name))name=base+`（恢复${n++===1?'':n-1}）`;b.name=name;names.add(name);return b;});
    db.boxes.push(...incoming);db.activeId=incoming[activeIndex].id;this.write(db);this.activeId=db.activeId;this.active=clone(incoming[activeIndex]);return {box:clone(this.active),count:incoming.length};
  }
  backup(current){
    const db=this.read(),saved=db.boxes.find(b=>b.id===current.id);
    if(!saved){const copy=this.makeBox({...current,name:current.name+'（此页面未保存副本）'});db.boxes.push(copy);db.activeId=copy.id;}
    else if(JSON.stringify(saved)!==JSON.stringify(current)){
      if(saved.revision===current.revision){db.boxes[db.boxes.findIndex(b=>b.id===current.id)]=clone(current);db.activeId=current.id;}
      else{const copy=this.makeBox({...current,name:current.name+'（此页面未保存副本）'});db.boxes.push(copy);db.activeId=copy.id;}
    }else db.activeId=current.id;
    return {...db,exportedAt:new Date().toISOString()};
  }
}
