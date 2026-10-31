import {connectLocalOCR,LOCAL_OCR_URL} from './local-ocr-client.js';
import {loadPicture,detectGrid,recognizeGrid} from './image-ocr.js';
import {gridToEntries,validateEntries,entriesToOrder} from './image-data.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rowTypes=[['ignore','忽略（标题／备注）'],['header','商品表头'],['owners','归属 CN'],['bag','袋子归属']];
async function draftDB(action,value){
  return new Promise((resolve,reject)=>{const req=indexedDB.open('gutuan-image-review',1);req.onupgradeneeded=()=>req.result.createObjectStore('drafts');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('drafts',action==='get'?'readonly':'readwrite'),s=tx.objectStore('drafts');const r=action==='get'?s.get('current'):action==='put'?s.put(value,'current'):s.delete('current');let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};};});
}

export function installImageImport({getCNs,importOrder,localOnly=false,getBoxName=()=>''}){
  const button=document.createElement('button');button.id='imageImportBtn';button.className='quiet';button.textContent='图片转排表';
  document.querySelector('#importBtn').before(button);
  const chooser=document.createElement('input');chooser.type='file';chooser.accept='image/png,image/jpeg,image/webp,image/bmp';chooser.hidden=true;document.body.append(chooser);
  const dialog=document.createElement('dialog');dialog.id='imageReviewDialog';dialog.className='image-review';document.body.append(dialog);
  let ocrMode=localOnly?'browser':'local',localToken='',localStatus='尚未连接本地 OCR';
  let d=null,picture=null,url=null,busy=false,aborter=null,saveTimer,revision=0,importing=false;
  const $=s=>dialog.querySelector(s);
  const resetCheck=()=>{const check=$('#imageConfirmed');if(check)check.checked=false;const b=$('[data-image-action="import"]');if(b)b.disabled=true;};
  async function persist(){if(!d)return;const version=revision;try{await draftDB('put',structuredClone(d));if(version===revision&&$('#imageDraftStatus'))$('#imageDraftStatus').textContent='核对草稿已保存';}catch{if($('#imageDraftStatus'))$('#imageDraftStatus').textContent='草稿保存失败，请保留原图或下载 Excel';}}
  function changed(){revision++;resetCheck();clearTimeout(saveTimer);saveTimer=setTimeout(persist,350);}
  function status(text){if($('#imageProgress'))$('#imageProgress').textContent=text;}
  function message(text){if($('#imageError'))$('#imageError').textContent=text;}
  function connectionHTML(){
    if(localOnly)return '';
    return `<div class="ocr-connection"><label>识别方式 <select id="ocrMode" ${busy?'disabled':''}><option value="local" ${ocrMode==='local'?'selected':''}>本机 PaddleOCR（推荐）</option><option value="browser" ${ocrMode==='browser'?'selected':''}>浏览器识别（备用，准确率较低）</option></select></label>${ocrMode==='local'?`<input id="localOcrCode" type="password" autocomplete="off" placeholder="粘贴 16 位本地连接码" aria-label="本地OCR连接码" value="${esc(localToken)}" ${busy?'disabled':''}><button class="quiet" data-image-action="connect-local" ${busy?'disabled':''}>连接本地 OCR</button><span id="localOcrStatus">${esc(localStatus)}</span><a href="${LOCAL_OCR_URL}/" target="_blank" rel="noopener">打开本地工具 ↗</a><small>先双击之前安装的“启动本地排表识别”文件，再打开本地工具复制连接码。电脑需开着；图片只在本机处理。浏览器询问连接本机服务时，需要允许才能使用。</small>`:'<small>无需开电脑上的本地服务；短 CN 和小字容易认错，请逐项核对。</small>'}</div>`;
  }
  function frame(){
    const contents=d?`<div class="image-review-split"><section class="original-pane"><div class="pane-title">原图对照 <label>缩放 <input id="imageZoom" type="range" min="50" max="250" value="100" aria-label="原图缩放"></label></div><div class="original-scroll"><img id="reviewOriginal" src="${esc(url)}" alt="待核对的原始排表图片"></div><p>可滚动、缩放原图。图片在本机处理，不会上传到云端。</p></section><section class="converted-pane">${d.phase==='review'?reviewHTML():gridHTML()}</section></div>`:`<div class="image-upload-empty"><h3>把排表图片转成订单</h3><p>选择清晰的表格截图，识别后对照原图修改，再确认导入。<br>支持重复商品表头和袋子行；手写、模糊或不规则排表需要更多手动校对。</p><button class="primary" data-image-action="choose">选择排表图片</button></div>`;
    dialog.innerHTML=`<div class="image-review-top"><div><h2>图片转排表</h2><p>识别草稿 → 对照修改 → 确认导入${getBoxName()?'：'+esc(getBoxName()):''}</p></div><div><button class="quiet" data-image-action="choose" ${busy?'disabled':''}>选择新图片</button><button class="quiet" data-image-action="close">${busy?'取消识别并关闭':'关闭'}</button></div></div>${connectionHTML()}<div class="image-status-bar"><span id="imageProgress">${busy?'正在识别…':d?.phase==='review'?'请逐项核对商品、归属与数量':d?'先核对表格文字与行类型，再生成导入明细':'支持 PNG / JPG / WebP / BMP，最大 15 MB'}</span><span id="imageDraftStatus"></span></div><p id="imageError" role="alert"></p>${contents}`;
    if(busy){for(const input of dialog.querySelectorAll('.converted-pane input,.converted-pane select,.converted-pane button'))input.disabled=true;}
  }
  function gridHTML(){
    const rows=d.grid?.length??0,cols=d.grid?.[0]?.length??0;
    return `<h3>1. 核对识别表格</h3><p class="review-tip">可直接改文字，并为每行选择用途。蓝色表头可能重复出现；序号行通常是归属 CN。“袋子”行中的每个名字算 1 个袋子。黄色格为低置信度识别。</p><div class="image-grid-controls"><label>列数（含行标）<input id="gridCols" type="number" min="2" max="25" value="${cols||9}"></label><label>行数（含标题）<input id="gridRows" type="number" min="2" max="60" value="${rows||12}"></label><button class="quiet" data-image-action="recut">按行列数重新均分并识别</button></div><p class="review-tip">${d.reliable?'已自动检测表格分隔线。':'未能可靠检测分隔线，当前使用均分网格；请调整行列数，或在下方直接修改。'} 可从明细页返回这里重做。</p><div class="image-grid-scroll"><table><thead><tr><th>行用途</th>${Array.from({length:cols},(_,i)=>`<th>第 ${i+1} 列</th>`).join('')}</tr></thead><tbody>${(d.grid??[]).map((row,r)=>`<tr><td><span class="grid-row-number">${r+1}</span><select data-grid-type="${r}" aria-label="第${r+1}行用途">${rowTypes.map(([v,l])=>`<option value="${v}" ${d.types[r]===v?'selected':''}>${l}</option>`).join('')}</select></td>${row.map((v,c)=>`<td><input class="${(d.confidence?.[r]?.[c]??100)<80&&v?'uncertain-cell':''}" data-grid-row="${r}" data-grid-col="${c}" aria-label="第${r+1}行第${c+1}列" value="${esc(v)}"></td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="image-settings"><label><input id="skipFirstColumn" type="checkbox" ${d.skipFirst?'checked':''}> 第一列为序号或行标，不作为商品／CN</label><label>商品名前缀（可选）<input id="imagePrefix" value="${esc(d.prefix??'')}" placeholder="例如：4WJ入场特卡"></label></div><div class="review-actions"><button class="quiet" data-image-action="append-grid-row">添加空白行</button><button class="primary" data-image-action="generate">生成可导入明细 →</button></div>`;
  }
  function reviewHTML(){
    const total=d.entries.reduce((s,e)=>s+(Number(e.qty)||0),0),products=new Set(d.entries.map(e=>e.product.trim()).filter(Boolean)).size,cns=new Set(d.entries.map(e=>e.cn.trim()).filter(Boolean)).size;
    return `<h3>2. 对照原图，核对导入明细</h3><div class="review-order-fields"><label>订单名称<input id="imageOrderName" maxlength="100" value="${esc(d.name)}" placeholder="填写订单名称"></label><label>原图总件数（可选校验）<input id="expectedImageQty" type="number" min="1" step="1" value="${esc(d.expectedQty??'')}" placeholder="例如：68"></label></div><p id="imageTotals" class="review-totals">${products} 个商品 · ${cns} 位团员 · ${total} 件</p><p class="review-tip">所有行均可修改；相同商品、相同 CN 会合并数量。“赠”会保留备注并计入重量，袋子按商品导入。CN 请与其他订单保持一致。</p>${d.warnings?.length?`<p class="warning">${d.warnings.map(esc).join('<br>')}</p>`:''}<div class="image-grid-scroll image-entry-scroll"><table><thead><tr><th>商品名称</th><th>归属 CN</th><th>数量</th><th>备注／原图格</th><th></th></tr></thead><tbody>${d.entries.map((e,i)=>`<tr><td><input data-entry="${i}" data-key="product" aria-label="第${i+1}条商品名称" value="${esc(e.product)}"></td><td><input list="imageKnownCNs" data-entry="${i}" data-key="cn" aria-label="第${i+1}条归属CN" value="${esc(e.cn)}"></td><td><input type="number" min="1" step="1" data-entry="${i}" data-key="qty" aria-label="第${i+1}条数量" value="${esc(e.qty)}"></td><td><input data-entry="${i}" data-key="note" aria-label="第${i+1}条备注" value="${esc(e.note??'')}"><small>${esc((e.sources??[]).join('、'))}</small></td><td><button class="delete" data-image-action="delete-entry" data-index="${i}">删除</button></td></tr>`).join('')}</tbody></table></div><datalist id="imageKnownCNs">${getCNs().map(cn=>`<option value="${esc(cn)}"></option>`).join('')}</datalist><div class="cn-replace"><span>统一修改 CN</span><input id="oldImageCN" placeholder="识别出的名字" aria-label="待替换CN"><span>→</span><input id="newImageCN" list="imageKnownCNs" placeholder="正确的 CN" aria-label="替换后的CN"><button class="quiet" data-image-action="replace-cn">替换全部匹配项</button></div><div class="review-actions"><button class="quiet" data-image-action="back-grid">← 返回识别表格</button><button class="quiet" data-image-action="add-entry">＋ 添加明细</button><button class="quiet" data-image-action="download">下载 Excel 排表</button></div><label class="image-confirm-label"><input id="imageConfirmed" type="checkbox"> 我已对照原图核对商品名称、CN 和数量，确认无误</label><button class="primary image-confirm-button" data-image-action="import" disabled>确认无误并导入此订单</button>`;
  }
  async function startRecognition(bounds){
    if(busy)return;
    if((bounds.xs.length-1)*(bounds.ys.length-1)>600){message('单次最多识别 600 个格子，请裁成多张图片');return;}
    busy=true;aborter=new AbortController();frame();const timeout=setTimeout(()=>aborter.abort(),ocrMode==='local'?300000:120000);
    try{const result=await recognizeGrid(picture,bounds,status,aborter.signal,{engine:ocrMode,token:localToken});Object.assign(d,result,{phase:'grid',bounds});changed();}
    catch(e){d.grid??=[['',''],['','']];d.types??=['header','owners'];d.phase='grid';d.ocrError=e.message;}
    finally{clearTimeout(timeout);busy=false;frame();if(d.ocrError){message('识别未完成：'+d.ocrError+'。可以重试，也可以手动修改表格后继续。');delete d.ocrError;}await persist();}
  }
  async function open(){
    if(!d){try{const restored=await draftDB('get');if(restored?.file){d=restored;const p=await loadPicture(d.file);picture=p.image;url=p.url;}}catch{}}
    frame();if(!dialog.open)dialog.showModal();
  }
  button.onclick=open;
  chooser.onchange=async()=>{
    const file=chooser.files[0];chooser.value='';if(!file)return;
    try{const p=await loadPicture(file);if(url)URL.revokeObjectURL(url);picture=p.image;url=p.url;const bounds=detectGrid(picture);const sourceHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');d={id:crypto.randomUUID(),sourceHash,file,name:file.name.replace(/\.[^.]+$/,''),prefix:'',skipFirst:true,grid:Array.from({length:bounds.ys.length-1},()=>Array(bounds.xs.length-1).fill('')),types:Array(bounds.ys.length-1).fill('ignore'),phase:'grid',reliable:bounds.reliable,bounds,entries:[]};await startRecognition(bounds);}catch(e){message(e.message);}
  };
  function updateTotals(){
    if(!d.entries||!$('#imageTotals'))return;
    $('#imageTotals').textContent=`${new Set(d.entries.map(e=>e.product.trim()).filter(Boolean)).size} 个商品 · ${new Set(d.entries.map(e=>e.cn.trim()).filter(Boolean)).size} 位团员 · ${d.entries.reduce((s,e)=>s+(Number(e.qty)||0),0)} 件`;
  }
  function checkReview(){
    validateEntries(d.entries);if(!d.name.trim())throw Error('请填写订单名称');
    const total=d.entries.reduce((s,e)=>s+Number(e.qty),0);
    if(d.expectedQty!==''&&d.expectedQty!==undefined&&(!Number.isSafeInteger(Number(d.expectedQty))||Number(d.expectedQty)<=0||Number(d.expectedQty)!==total))throw Error(`当前明细共 ${total} 件，与填写的原图总件数不一致，请核对`);
  }
  dialog.addEventListener('input',e=>{
    const t=e.target;if(!d)return;
    if(t.id==='imageZoom'){$('#reviewOriginal').style.width=t.value+'%';return;}
    if(t.id==='imageConfirmed'){try{checkReview();$('[data-image-action="import"]').disabled=!t.checked;message('');}catch(err){t.checked=false;message(err.message);}return;}
    if(t.dataset.gridRow!==undefined){d.grid[Number(t.dataset.gridRow)][Number(t.dataset.gridCol)]=t.value;changed();}
    if(t.dataset.entry!==undefined){d.entries[Number(t.dataset.entry)][t.dataset.key]=t.value;changed();updateTotals();}
    if(t.id==='imageOrderName'){d.name=t.value;changed();}
    if(t.id==='expectedImageQty'){d.expectedQty=t.value;changed();}
    if(t.id==='imagePrefix'){d.prefix=t.value;changed();}
  });
  dialog.addEventListener('change',e=>{
    const t=e.target;if(!d)return;
    if(t.id==='ocrMode'){ocrMode=t.value;frame();return;}
    if(t.dataset.gridType!==undefined){d.types[Number(t.dataset.gridType)]=t.value;changed();}
    if(t.id==='skipFirstColumn'){d.skipFirst=t.checked;changed();}
  });
  dialog.addEventListener('cancel',()=>{if(busy)aborter?.abort();});
  dialog.addEventListener('click',async e=>{
    const b=e.target.closest('[data-image-action]');if(!b)return;const a=b.dataset.imageAction;
    if(a==='close'){if(busy)aborter?.abort();await persist();dialog.close();return;}
    if(a==='connect-local'){const code=$('#localOcrCode').value.trim();b.disabled=true;try{await connectLocalOCR(code);localToken=code;localStatus='已连接 · 本机识别';message('');}catch(err){localToken='';localStatus='连接未成功';message(err.message);}finally{b.disabled=false;$('#localOcrStatus').textContent=localStatus;}return;}
    if(a==='choose'){if(!busy){if(ocrMode==='local'&&!localToken){message('请先启动并连接本地 OCR，再选择图片。');return;}chooser.click();}return;}
    if(busy||!d)return;
    message('');
    if(a==='recut'){
      const rows=Number($('#gridRows').value),cols=Number($('#gridCols').value);
      if(!Number.isInteger(rows)||rows<2||rows>60||!Number.isInteger(cols)||cols<2||cols>25){message('行数须为 2–60，列数须为 2–25');return;}
      d.reliable=false;await startRecognition({xs:Array.from({length:cols+1},(_,i)=>Math.round(i*(picture.width-1)/cols)),ys:Array.from({length:rows+1},(_,i)=>Math.round(i*(picture.height-1)/rows))});
    }
    if(a==='append-grid-row'){d.grid.push(Array(d.grid[0]?.length||2).fill(''));d.types.push('owners');changed();frame();}
    if(a==='generate'){const result=gridToEntries(d.grid,d.types,{skipFirst:d.skipFirst,prefix:d.prefix.trim()});d.entries=result.entries;d.warnings=result.warnings;d.phase='review';changed();frame();}
    if(a==='back-grid'){d.phase='grid';changed();frame();message('重新生成明细将以此表格为准，覆盖上一步的明细修改。');}
    if(a==='add-entry'){d.entries.push({product:'',cn:'',qty:1,note:'',sources:[]});changed();frame();}
    if(a==='delete-entry'){d.entries.splice(Number(b.dataset.index),1);changed();frame();}
    if(a==='replace-cn'){const old=$('#oldImageCN').value.trim(),value=$('#newImageCN').value.trim();if(!old||!value){message('请填写要替换的 CN 和正确 CN');return;}let count=0;for(const entry of d.entries)if(entry.cn.trim()===old){entry.cn=value;count++;}changed();frame();message(count?`已修改 ${count} 条匹配记录`:'没有找到完全匹配的 CN');}
    if(a==='download'){try{checkReview();const order=entriesToOrder({entries:d.entries,name:d.name,source:d.file.name,draftId:d.id,sourceHash:d.sourceHash});exportReviewExcel(order);}catch(err){message(err.message);}}
    if(a==='import'){
      if(importing||!$('#imageConfirmed')?.checked)return;
      try{checkReview();importing=true;b.disabled=true;await persist();const order=entriesToOrder({entries:d.entries,name:d.name,source:d.file.name,draftId:d.id,sourceHash:d.sourceHash});await importOrder(order);await draftDB('delete').catch(()=>{});clearTimeout(saveTimer);d=null;picture=null;if(url)URL.revokeObjectURL(url);url=null;dialog.close();}
      catch(err){message(err.message);b.disabled=false;}finally{importing=false;}
    }
  });
}

function exportReviewExcel(order){
  const X=window.XLSX;if(!X)throw Error('Excel 组件尚未加载，请稍后再试');
  const names=[...new Set(order.items.flatMap(i=>i.owners.map(a=>a.cn)))];
  const rows=[['图片转录排表'],['','分类',order.name],['','种类',...order.items.map(i=>i.name)],['','单价'],['个人件数','昵称/总数',...order.items.map(i=>i.owners.reduce((s,a)=>s+a.qty,0))],...names.map(cn=>{const counts=order.items.map(i=>i.owners.filter(a=>a.cn===cn).reduce((s,a)=>s+a.qty,0));return [counts.reduce((s,n)=>s+n,0),cn,...counts];})];
  const wb=X.utils.book_new(),sheet=X.utils.aoa_to_sheet(rows);sheet['!cols']=[{wch:12},{wch:25},...order.items.map(()=>({wch:22}))];X.utils.book_append_sheet(wb,sheet,'汇总表');
  if(order.imageNotes.length)X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([['商品','CN','数量','备注'],...order.imageNotes.map(e=>[e.product,e.cn,e.qty,e.note])]),'核对备注');
  X.writeFile(wb,order.name.replace(/[\\/:*?"<>|]/g,'_')+'-图片转录排表.xlsx');
}
