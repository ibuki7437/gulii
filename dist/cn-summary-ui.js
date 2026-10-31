import {aggregateWorkbook,summaryWorkbook} from './cn-summary.js';
import {entriesToOrder} from './image-data.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function installCNSummary({importOrder,getBoxName=()=>''}){
  const button=document.createElement('button');button.id='cnSummaryBtn';button.className='quiet';button.textContent='按 CN 合并排表';document.querySelector('#imageImportBtn').before(button);
  const dialog=document.createElement('dialog');dialog.className='cn-summary-dialog';dialog.id='cnSummaryDialog';document.body.append(dialog);
  let data=null,source='',hash='',confirmed=false,importing=false,readRevision=0;
  const $=selector=>dialog.querySelector(selector);
  function render(){dialog.innerHTML=`<div class="dialog-heading"><div><h2>按 CN 合并排表</h2><p>同一 CN、同名种类的件数相加。${getBoxName()?`确认后导入：${esc(getBoxName())}`:'确认后导入为一个订单。'}</p></div><button class="quiet" id="cnClose">关闭</button></div><div class="cn-summary-body"><label class="primary cn-file-label">选择 Excel 排表<input id="cnFile" type="file" accept=".xlsx,.xls"></label><span class="cn-source">${esc(source)}</span><p id="cnError" class="warning" role="alert"></p>${data?`<div class="cn-result-info">${data.categories.length} 个分类 · ${data.columns.length} 个原商品列 → ${data.products.length} 个种类 · ${data.names.length} 位团员 · ${data.total} 件<br><small>合并前后数量一致。分类：${data.categories.map(esc).join('、')}</small></div><p class="dialog-note">只汇总件数，原分类和单价保留在导出文件的来源明细里。CN 和种类按去除首尾空格后的名称完全匹配。</p><label class="form-label">汇总订单名称<input id="cnOrderName" maxlength="100" value="${esc(data.name)}"></label><input id="cnSearch" type="search" placeholder="搜索 CN 查看明细" aria-label="搜索汇总CN"><div class="cn-table-scroll"><table><thead><tr><th>归属 CN</th><th>合计件数</th>${data.products.map(p=>`<th>${esc(p)}</th>`).join('')}</tr></thead><tbody id="cnRows"></tbody></table></div><p class="dialog-note">搜索仅影响预览，导出和导入始终包含全部 ${data.names.length} 位团员。</p><label class="image-confirm-label"><input id="cnConfirmed" type="checkbox"> 我已核对 CN、种类和总件数，确认合并为一个订单</label><div class="dialog-footer"><button class="quiet" id="cnDownload">下载汇总 Excel</button><button class="primary" id="cnImport" disabled>确认并导入为一个订单</button></div>`:`<p class="dialog-note">选择小程序导出的原始汇总表。整个过程在浏览器内完成，无需联网识别，也无需先整理分类。</p>`}</div>`;
    if(data)rows('');
  }
  function rows(q){$('#cnRows').innerHTML=data.matrix.filter(r=>r.cn.toLowerCase().includes(q.toLowerCase())).map(r=>`<tr><td>${esc(r.cn)}</td><td>${r.counts.reduce((a,b)=>a+b,0)}</td>${r.counts.map(n=>`<td>${n||'—'}</td>`).join('')}</tr>`).join('');}
  function order(){if(!data.name.trim())throw Error('请填写订单名称');const entries=data.matrix.flatMap(r=>r.counts.map((qty,c)=>({cn:r.cn,product:data.products[c],qty})).filter(e=>e.qty>0));return {...entriesToOrder({entries,name:data.name,source}),mergeSourceHash:hash};}
  button.onclick=()=>{render();dialog.showModal();};
  dialog.addEventListener('change',async e=>{
    if(e.target.id==='cnConfirmed'){confirmed=e.target.checked;$('#cnImport').disabled=!confirmed;return;}
    if(e.target.id!=='cnFile')return;const f=e.target.files[0];if(!f)return;const revision=++readRevision;
    data=null;source='';hash='';confirmed=false;
    try{if(f.size>20*1024*1024)throw Error('文件超过 20 MB，请按团拆分后再试');const buffer=await f.arrayBuffer(),X=window.XLSX;if(revision!==readRevision)return;if(!X)throw Error('Excel 组件尚未加载，请稍后再试');const wb=X.read(buffer,{type:'array'}),parsed=aggregateWorkbook(wb,X),sourceHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');if(revision!==readRevision)return;data=parsed;hash=sourceHash;source=f.name;data.name=(String(wb.Sheets[wb.SheetNames[0]]?.A1?.v??'').match(/【([^】]+)】/)?.[1]||f.name.replace(/\.[^.]+$/,''))+'（合并汇总）';render();}
    catch(err){if(revision!==readRevision)return;data=null;render();$('#cnError').textContent=err.message;}
  });
  dialog.addEventListener('input',e=>{if(e.target.id==='cnSearch')rows(e.target.value.trim());if(e.target.id==='cnOrderName'){data.name=e.target.value;confirmed=false;$('#cnConfirmed').checked=false;$('#cnImport').disabled=true;}});
  dialog.addEventListener('click',async e=>{
    const id=e.target.id;if(id==='cnClose'){if(!importing)dialog.close();return;}
    if(id==='cnDownload'){try{order();window.XLSX.writeFile(summaryWorkbook(data,window.XLSX,data.name),data.name.replace(/[\\/:*?"<>|]/g,'_')+'.xlsx');}catch(err){$('#cnError').textContent=err.message;}}
    if(id==='cnImport'&&confirmed&&!importing){importing=true;e.target.disabled=true;try{await importOrder(order());data=null;source='';hash='';confirmed=false;dialog.close();}catch(err){$('#cnError').textContent=err.message;$('#cnImport').disabled=false;}finally{importing=false;}}
  });
}
