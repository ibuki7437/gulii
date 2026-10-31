import {notesButton,pendingNotice} from './order-notes.js';
import {installOrderNotes} from './order-notes-ui.js';
import {BoxLibrary,BOXES_KEY,LEGACY_KEY} from './boxes.js';
import {members,orderCalc,settle,parseWorkbook,hasWeight} from './calc.js';
import {upsertItem,deleteItem,restoreItem,renameItem} from './items.js';
import {unitWeight,ownerWeight,fillSingleProduct} from './weights.js';
import {installImageImport} from './image-import.js';
import {installCNSummary} from './cn-summary-ui.js';
import {installMemberQuery} from './member-query-ui.js';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fresh=()=>({version:1,name:'我的国际箱 · 01',orders:[],gross:'',fee:''});
let box=fresh(),page='weigh',query='',filter='all',result=null,library=null,loadFailure='',importBusy=false;
try{library=new BoxLibrary(localStorage,validate,fresh);box=library.active;if(library.warning)setTimeout(()=>showStorageNotice(library.warning),0);}catch(e){loadFailure=e.message;setTimeout(()=>showStorageNotice('未能读取本地进度：'+loadFailure+'。原始数据已保留，请先导出原始备份，再协助恢复。'),0);}
function validate(b){if(!b||b.version!==1||!Array.isArray(b.orders)||typeof b.name!=='string')throw Error('备份格式不正确');const ids=new Set();for(const o of b.orders){if(typeof o.id!=='string'||ids.has(o.id)||typeof o.name!=='string'||!Array.isArray(o.items))throw Error('订单数据格式不正确');ids.add(o.id);for(const i of o.items){if(typeof i.id!=='string'||typeof i.name!=='string'||!Array.isArray(i.owners)||!i.owners.length)throw Error('商品数据格式不正确');for(const a of i.owners)if(typeof a.cn!=='string'||!a.cn.trim()||!Number.isInteger(a.qty)||a.qty<=0)throw Error('团员或数量无效');}if(o.mode&&!['item','person'].includes(o.mode))throw Error('称重模式无效');}return b;}
function persistBox(candidate){
  if(!library)throw Error('本地数据读取异常，原始记录未覆盖。请先导出原始备份。');
  box=library.saveBox(candidate);result=null;$('#saveStatus').textContent='● 已自动保存';renderBoxPicker();return box;
}
function save(){try{persistBox(box);return true;}catch(e){$('#saveStatus').textContent='保存失败 · 请导出备份';showStorageNotice(e.message+' 当前页面的未保存进度可通过“导出全部箱子备份”保留。');toast(e.message);return false;}}

let toastTimer;function toast(s){$('#toast').textContent=s;$('#toast').classList.add('toast-visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('toast-visible'),4200);}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);}
function backup(){
  try{const data=library?library.backup(box):{format:'gutuan-raw-recovery',multiRaw:localStorage.getItem(BOXES_KEY),legacyRaw:localStorage.getItem(LEGACY_KEY)};
    download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),library?'国际运费-全部箱子备份.json':'国际运费-原始数据备份.json');
  }catch(e){try{const safeRead=key=>{try{return localStorage.getItem(key);}catch{return null;}};download(new Blob([JSON.stringify({format:'gutuan-raw-recovery',unsavedBox:box,multiRaw:safeRead(BOXES_KEY),legacyRaw:safeRead(LEGACY_KEY)},null,2)],{type:'application/json'}),'国际运费-原始数据与当前进度备份.json');toast('已保留原始数据和此页面进度，请协助恢复。');}catch{toast('备份失败：'+e.message);}}
}

function fmt(n,d=2){return Number(n).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});}
function totalQty(o){return o.items.reduce((s,i)=>s+i.owners.reduce((a,b)=>a+b.qty,0),0);}
function progress(o){const c=orderCalc(o);if(o.complete&&!c.error)return ['已完成','done'];if(o.mode==='person'){const n=members(o).length;return [n===c.missing?'未开始':`${n-c.missing} / ${n} 人已称`,''];}const q=totalQty(o);return [q===c.missing?'未开始':`${q-c.missing} / ${q} 件已称`,''];}
function renderStats(){const done=box.orders.filter(o=>o.complete&&!orderCalc(o).error).length;const names=new Set(box.orders.flatMap(members));const grams=box.orders.reduce((s,o)=>s+orderCalc(o).net,0);$('#navCount').textContent=box.orders.length;$('#stats').innerHTML=[['订单总数',box.orders.length,'单'],['已完成称重',done,'/ '+box.orders.length+' 单'],['参与团员',names.size,'人'],['已录商品重量',fmt(grams,1),'克']].map(([l,n,u])=>`<div class="stat"><div class="stat-label">${l}</div><div class="stat-num">${n}<small>${u}</small></div></div>`).join('');}
function render(){renderBoxPicker();for(const b of document.querySelectorAll('nav button'))b.classList.toggle('active',b.dataset.page===page);$('#boxName').value=box.name;$('#pageTitle').textContent=page==='weigh'?'订单称重':'整箱运费结算';$('#pageSubtitle').textContent=page==='weigh'?'导入排表，录入商品和订单重量，按 CN 分摊国际运费。':'填写整箱重量和总运费，计算并导出各团员的应付金额。';renderStats();if(page==='weigh')renderOrders();else renderSettle();}
function empty(){return `<div class="empty"><div class="empty-icon">▱</div><h2>从第一份排表开始</h2><p>直接导入小程序导出的原始 Excel，无需提前整理。<br>每份排表成为一个订单，可以一次导入多份。</p><button class="primary" data-action="import">＋ 选择排表文件</button><button class="demo" data-action="demo">先用示例数据体验一下</button></div>`;}
function renderOrders(){const orders=box.orders.filter(o=>(o.name.toLowerCase().includes(query.toLowerCase())||o.source.toLowerCase().includes(query.toLowerCase()))&&(filter==='all'||filter==='done'&&o.complete||filter==='pending'&&!o.complete||filter==='untouched'&&progress(o)[0]==='未开始'));
$('#workspace').innerHTML=`${pendingNotice(box)}<div class="toolbar"><div class="section-title">订单称重<small>按订单展开 · 直接填写重量</small></div><input class="search" id="search" placeholder="搜索订单名称…" aria-label="搜索订单名称" value="${esc(query)}"><select id="statusFilter" aria-label="筛选订单状态"><option value="all">全部订单</option><option value="untouched">未开始</option><option value="pending">未完成</option><option value="done">已完成</option></select><button class="help-link" data-action="help">分摊规则</button></div><div id="orderList">${box.orders.length?(orders.length?orders.map(orderHTML).join(''):'<div class="empty"><p>没有找到符合条件的订单，试试其他名称或筛选条件。</p></div>'):empty()}</div>`;$('#statusFilter').value=filter;}
function orderHTML(o){const c=orderCalc(o),p=progress(o),idx=box.orders.indexOf(o)+1,single=o.items.length===1;return `<section class="order" data-order="${esc(o.id)}"><div class="order-header"><button class="fold" data-action="fold" aria-label="${o.collapsed?'展开':'折叠'}订单" aria-expanded="${!o.collapsed}">${o.collapsed?'▸':'▾'}</button><span class="order-number">${String(idx).padStart(2,'0')}</span><div class="order-title">${esc(o.name)}<small>${o.items.length} 个商品条目 · ${totalQty(o)} 件 · ${members(o).length} 位团员</small></div>${notesButton(o)}<span class="badge ${p[1]}" data-progress>${p[0]}</span><button class="delete" data-action="delete" aria-label="删除 ${esc(o.name)}">移除</button></div>${o.collapsed?'':`${single?`<div class="batch-weight"><label>统一单件克重（克）<input class="weight" type="number" min="0.001" step="any" data-unit-draft value="${esc(o.unitDraft??o.items[0].weight??'')}" placeholder="手动填写" aria-label="${esc(o.name)}统一单件克重"></label><button class="primary" data-action="fill-quantity">按数量一键填充克重</button><p>商品总重＝单件克重 × 各人数量。点击后覆盖此商品各人的单件克重${o.mode==='person'?'，并切换为按商品计重':''}；之后可逐人修改。</p></div>`:''}<div class="order-tools"><span>录入方式</span><select data-mode aria-label="称重录入方式"><option value="item" ${o.mode!=='person'?'selected':''}>按商品 · 单件重量套用数量</option><option value="person" ${o.mode==='person'?'selected':''}>按人合称 · 填商品总重</option></select><label>订单总重 A <input class="weight" type="number" min="0.001" step="any" placeholder="待填写" data-field="gross" value="${esc(o.gross)}" aria-label="${esc(o.name)}订单总重"> 克</label></div><div class="item-toolbar"><button class="quiet" data-action="add-item">＋ 手动添加商品</button><button class="text-button" data-action="manage-items">管理商品${o.deletedItems?.length?` · 已删除 ${o.deletedItems.length}`:''}</button><span>增删或调整数量后，请重新核对订单总重</span></div><div class="table-scroll"><table><thead><tr><th>${o.mode==='person'?'团员 CN':'商品名称'}</th><th>数量</th><th>${o.mode==='person'?'称重口径':'归属 CN'}</th><th>${o.mode==='person'?'商品总重':'单件克重'}（克）</th></tr></thead><tbody>${o.mode==='person'?members(o).map(cn=>`<tr><td class="item-name">${esc(cn)}</td><td>${o.items.reduce((s,i)=>s+i.owners.filter(a=>a.cn===cn).reduce((v,a)=>v+a.qty,0),0)}</td><td class="owner">此人在本订单的全部商品</td><td><input class="weight" type="number" min="0.001" step="any" data-person="${esc(cn)}" aria-label="${esc(cn)}合称重量" placeholder="待填写" value="${esc(o.personWeights?.[cn]??'')}"></td></tr>`).join(''):itemOwnerRows(o)}</tbody></table></div><div class="order-bottom"><span>商品 <strong data-net>${fmt(c.net,1)} g</strong></span><span>订单包装 <strong data-pack>${c.packaging===null?'待完成':fmt(c.packaging,1)+' g'}</strong></span><span class="warning" data-error>${esc(c.error||'')}</span><button class="${o.complete?'quiet':'primary'}" data-action="complete">${o.complete?'重新核对':'完成此单称重'}</button></div>`}</section>`;}
function updateOrder(section,o){const c=orderCalc(o),p=progress(o);section.querySelector('[data-progress]').textContent=p[0];section.querySelector('[data-progress]').className='badge '+p[1];const net=section.querySelector('[data-net]');if(net)net.textContent=fmt(c.net,1)+' g';const pack=section.querySelector('[data-pack]');if(pack)pack.textContent=c.packaging===null?'待完成':fmt(c.packaging,1)+' g';const err=section.querySelector('[data-error]');if(err)err.textContent=c.error||'';const complete=section.querySelector('[data-action="complete"]');if(complete){complete.textContent='完成此单称重';complete.className='primary';}refreshOwnerRows(section,o);renderStats();}
function renderSettle(){let r,error='';try{r=settle(box);result=r;}catch(e){error=e.message;}$('#workspace').innerHTML=`${pendingNotice(box)}<div class="toolbar"><div class="section-title">整箱结算<small>重量单位：克 · 金额单位：元</small></div><button class="help-link" data-action="help">分摊规则</button></div><div class="settle-inputs"><div><label for="boxGross">整箱重量 E（含箱子、填充物）</label><input class="weight" id="boxGross" type="number" min="0.001" step="any" placeholder="填写整箱重量" value="${esc(box.gross)}"></div><div><label for="boxFee">总国际运费（元）</label><input class="weight" id="boxFee" type="number" min="0" step="0.01" placeholder="填写实际总运费" value="${esc(box.fee)}"></div><button class="primary" data-action="calculate">计算整团运费</button></div>${r?resultsHTML(r):`<div class="empty"><div class="empty-icon">◷</div><h2>待生成运费明细</h2><p>${esc(error)}。<br>订单全部完成后，填写整箱重量与总运费，即可生成明细。</p><button class="quiet" data-action="back">返回订单称重</button></div>`}`;}
function resultsHTML(r){return `<div class="result-head"><h2>${esc(box.name)} · 整团运费表</h2><div><button class="quiet" data-action="xlsx">导出 Excel</button><button class="primary" data-action="png">导出群聊图片</button></div></div><div class="result-meta">整箱 ${fmt(r.e,1)} g ／ 订单合计 ${fmt(r.d,1)} g ／ 箱子及填充物 ${fmt(r.f,1)} g ／ 每克均价 ¥${fmt(r.rate,6)}<br>商品重量含自带袋子与背卡；各阶段按比例计算，保留精度至最终结算。</div><div class="result-table"><table><thead><tr><th>CN</th><th>商品重 g</th><th>订单包装 g</th><th>箱重分摊 g</th><th>最终重量 g</th><th>应付运费 ¥</th></tr></thead><tbody>${r.rows.map(p=>`<tr><td>${esc(p.cn)}</td><td>${fmt(p.net)}</td><td>${fmt(p.pack)}</td><td>${fmt(p.box)}</td><td>${fmt(p.g)}</td><td class="money">${fmt(p.fee)}</td></tr>`).join('')}<tr><td>合计</td><td>${fmt(r.rows.reduce((s,p)=>s+p.net,0))}</td><td>${fmt(r.rows.reduce((s,p)=>s+p.pack,0))}</td><td>${fmt(r.f)}</td><td>${fmt(r.e)}</td><td class="money">${fmt(r.price)}</td></tr></tbody></table></div><p class="result-check">✓ 应付金额合计 ¥${fmt(r.rows.reduce((s,p)=>s+p.cents,0)/100)}，与总国际运费一致</p><details class="details"><summary>查看订单分摊与金额尾差明细</summary><p>尾差按最大余数法分配。调整额表示相对各人独立四舍五入结果的差额。</p><div class="result-table"><table><thead><tr><th>CN</th><th>所属订单</th><th>商品重 g</th><th>订单包装 g</th><th>商品＋包装 g</th></tr></thead><tbody>${r.details.map(p=>`<tr><td>${esc(p.cn)}</td><td>${esc(p.order)}</td><td>${fmt(p.net)}</td><td>${fmt(p.pack)}</td><td>${fmt(p.d)}</td></tr>`).join('')}</tbody></table></div><p>${r.rows.filter(p=>p.adjustment).map(p=>`${esc(p.cn)}：${p.adjustment>0?'+':''}${p.adjustment.toFixed(2)} 元`).join('；')||'本次无需调整独立四舍五入金额。'}</p></details>`;}
async function importFiles(files){if(!library){toast('请先恢复本地数据');return;}if(importBusy)return;if(!window.XLSX){toast('Excel 组件还未加载完成，请稍后再试');return;}importBusy=true;let imported=0;const errors=[],duplicates=[];for(const file of files){try{if(file.size>20*1024*1024)throw Error('文件超过 20 MB');if(box.orders.some(o=>o.source===file.name)){duplicates.push(file.name);continue;}const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});const incoming=parseWorkbook(wb,file.name,XLSX);box.orders.push(...incoming);imported+=incoming.length;}catch(e){errors.push(file.name+'：'+e.message);}}if(imported){save();page='weigh';query='';filter='all';render();}if(errors.length)alert('部分文件未导入：\n'+errors.join('\n'));if(duplicates.length)alert('以下同名文件已导入，本次跳过，避免重复计费：\n'+duplicates.join('\n'));importBusy=false;toast(imported?`已导入 ${imported} 个订单，原文件未修改`:'没有新增订单');}
function exportXlsx(){try{const r=settle(box),wb=XLSX.utils.book_new();const rows=[['整团国际运费表',box.name],['整箱重量(g)',r.e,'总国际运费(元)',r.price,'每克均价(元/g)',r.rate],['说明','商品包含自带袋子和背卡；包装两阶段按重分摊。金额按最大余数法结算至分。'],[],['CN','商品重量(g)','订单包装(g)','分摊箱重(g)','最终计费重量(g)','应付运费(元)','相对四舍五入调整(元)'],...r.rows.map(p=>[p.cn,p.net,p.pack,p.box,p.g,p.fee,p.adjustment]),['合计',r.rows.reduce((s,p)=>s+p.net,0),r.rows.reduce((s,p)=>s+p.pack,0),r.f,r.e,r.price]];const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:28},...Array.from({length:6},()=>({wch:23}))];for(let row=5;row<rows.length;row++)for(let col=1;col<7;col++){const cell=ws[XLSX.utils.encode_cell({r:row,c:col})];if(cell?.t==='n')cell.z='0.00';}XLSX.utils.book_append_sheet(wb,ws,'整团运费');const d=XLSX.utils.aoa_to_sheet([['订单','CN','商品重(g)','订单包装(g)','商品加包装(g)'],...r.details.map(p=>[p.order,p.cn,p.net,p.pack,p.d])]);d['!cols']=[{wch:30},{wch:28},{wch:18},{wch:18},{wch:20}];XLSX.utils.book_append_sheet(wb,d,'订单分摊明细');const weights=[['订单','商品','CN','数量','称重模式','单件重(g)','合称重(g)','订单总重(g)','称重完成']];for(const o of box.orders){if(o.mode==='person'){for(const cn of members(o))weights.push([o.name,'合称商品',cn,o.items.reduce((s,i)=>s+i.owners.filter(a=>a.cn===cn).reduce((v,a)=>v+a.qty,0),0),'按人合称','',Number(o.personWeights[cn]),Number(o.gross),'是']);}else for(const i of o.items)for(const a of i.owners)weights.push([o.name,i.name,a.cn,a.qty,'按商品',Number(i.overrides?.[a.cn]||i.weight),'',Number(o.gross),'是']);}const w=XLSX.utils.aoa_to_sheet(weights);w['!cols']=[{wch:25},{wch:30},{wch:25},...Array.from({length:6},()=>({wch:18}))];XLSX.utils.book_append_sheet(wb,w,'称重记录');XLSX.writeFile(wb,box.name+'-国际运费.xlsx');toast('已导出运费表与核对明细');}catch(e){toast(e.message);}}
async function exportPng(){try{const r=settle(box);await document.fonts.ready;const chunks=[];for(let i=0;i<r.rows.length;i+=24)chunks.push(r.rows.slice(i,i+24));for(let p=0;p<chunks.length;p++){const rows=chunks[p],canvas=document.createElement('canvas'),width=1200,height=330+rows.length*58;canvas.width=width*1.5;canvas.height=height*1.5;const c=canvas.getContext('2d');c.scale(1.5,1.5);c.fillStyle='#f8f7f3';c.fillRect(0,0,width,height);c.fillStyle='#466b58';c.font='500 16px "Noto Sans SC",sans-serif';c.fillText('国际计算工具 / 整团运费表',48,48);c.fillStyle='#303a36';c.font='500 29px "Noto Sans SC",sans-serif';c.fillText(box.name,48,100,1100);c.font='16px "Noto Sans SC",sans-serif';c.fillStyle='#7c8774';c.fillText(`整箱 ${fmt(r.e,1)} g   ·   总运费 ¥${fmt(r.price)}   ·   每克 ¥${fmt(r.rate,6)}   ·   ${p+1}/${chunks.length} 页`,48,141);const xs=[48,365,525,685,855,1085];const titles=['CN','商品重 g','订单包装 g','分摊箱重 g','最终重 g','应付 ¥'];c.fillStyle='#e7ede1';c.fillRect(32,170,1136,46);c.font='15px "Noto Sans SC",sans-serif';titles.forEach((t,i)=>{c.fillStyle='#63745b';c.textAlign=i===0?'left':'right';c.fillText(t,xs[i],199);});rows.forEach((row,i)=>{const y=216+i*58;c.fillStyle=i%2?'#f7f9f3':'#fff';c.fillRect(32,y,1136,58);const vals=[row.cn,fmt(row.net),fmt(row.pack),fmt(row.box),fmt(row.g),fmt(row.fee)];vals.forEach((v,j)=>{c.font=(j===5?'500 ':'')+'17px "Noto Sans SC",sans-serif';c.fillStyle=j===5?'#466b58':'#48513f';c.textAlign=j===0?'left':'right';c.fillText(v,xs[j],y+36,j===0?260:145);});});c.textAlign='left';c.font='15px "Noto Sans SC",sans-serif';c.fillStyle='#63745b';c.fillText(`全团 ${r.rows.length} 人  /  应付合计 ¥${fmt(r.price)}（与实际总运费一致）`,48,height-67);c.font='12px "Noto Sans SC",sans-serif';c.fillStyle='#929b86';c.fillText('商品含自带袋子与背卡；两阶段按重量分摊，金额结算到分。重量展示四舍五入，计算使用完整精度。',48,height-33);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));download(blob,box.name+'-运费表-'+(p+1)+'.png');}toast(`已生成 ${chunks.length} 张图片；多页导出请允许浏览器下载多个文件`);}catch(e){toast(e.message);}}
function demo(){if(box.orders.length)return;box.name='运费计算示例箱';box.orders=[{id:crypto.randomUUID(),name:'示例 · 亚克力与纸片',source:'示例数据（非真实排表）',gross:180,mode:'item',complete:false,items:[{id:'a',name:'餐厅联动 · 亚克力立牌',owners:[{cn:'小杏',qty:1},{cn:'小葵',qty:1}],weight:42,overrides:{}},{id:'b',name:'周年纪念 · 明信片',owners:[{cn:'小杏',qty:2},{cn:'阿圆',qty:1}],weight:8,overrides:{}},{id:'c',name:'活动特典 · 透卡',owners:[{cn:'阿圆',qty:1}],weight:'',overrides:{}}],personWeights:{}}];save();render();toast('这是示例数据，可新建箱子开始正式记录');}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.page){page=b.dataset.page;render();return;}const action=b.dataset.action;if(!action)return;const section=b.closest('[data-order]'),o=box.orders.find(o=>o.id===section?.dataset.order);if(action==='import')$('#files').click();if(action==='help')$('#helpDialog').showModal();if(action==='demo')demo();if(action==='back'){page='weigh';render();}if(action==='calculate'){save();renderSettle();}if(action==='xlsx')exportXlsx();if(action==='png')exportPng();if(!o)return;if(action==='fill-quantity'){try{fillSingleProduct(o,section.querySelector('[data-unit-draft]').value);save();render();toast('已按各人数量填充商品克重，请核对后完成称重');}catch(err){toast(err.message);}return;}if(action==='add-item')openItemEditor(o);if(action==='rename-item')openRenameItem(o,b.dataset.itemId);if(action==='edit-item')openItemEditor(o,b.dataset.itemId);if(action==='manage-items')openItemManager(o);if(action==='delete-item')removeItem(o,b.dataset.itemId);if(action==='fold'){o.collapsed=!o.collapsed;save();renderOrders();}if(action==='delete'&&confirm(`移除订单“${o.name}”及其称重记录？原 Excel 不受影响。`)){box.orders=box.orders.filter(a=>a.id!==o.id);save();render();}if(action==='complete'){const c=orderCalc(o);if(c.error){toast(c.error);return;}o.complete=true;save();render();toast('这笔订单称重已完成');}if(action==='override'){const item=o.items.find(i=>i.id===b.dataset.itemId);item.showOverrides=!item.showOverrides;renderOrders();}});
document.addEventListener('input',e=>{const t=e.target;if(t.id==='boxName'){box.name=t.value;save();return;}if(t.id==='search'){query=t.value;const pos=t.selectionStart;renderOrders();$('#search').focus();$('#search').setSelectionRange(pos,pos);return;}if(t.id==='boxGross'||t.id==='boxFee'){box[t.id==='boxGross'?'gross':'fee']=t.value;save();return;}const section=t.closest('[data-order]');if(!section)return;const o=box.orders.find(o=>o.id===section.dataset.order);if(t.hasAttribute('data-unit-draft')){o.unitDraft=t.value;save();return;}if(t.dataset.field==='gross')o.gross=t.value;else if(t.dataset.item)o.items.find(i=>i.id===t.dataset.item).weight=t.value;else if(t.dataset.person){o.personWeights??={};o.personWeights[t.dataset.person]=t.value;}else if(t.dataset.overrideItem){const item=o.items.find(i=>i.id===t.dataset.overrideItem);item.overrides??={};item.overrides[t.dataset.cn]=t.value===''?null:t.value;}else return;o.complete=false;save();updateOrder(section,o);});
document.addEventListener('change',e=>{if(e.target.id==='statusFilter'){filter=e.target.value;renderOrders();}if(e.target.hasAttribute('data-mode')){const o=box.orders.find(o=>o.id===e.target.closest('[data-order]').dataset.order);o.mode=e.target.value;o.complete=false;save();render();}});
$('#importBtn').onclick=()=>$('#files').click();$('#files').onchange=async e=>{await importFiles([...e.target.files]);e.target.value='';};$('#backup').onclick=backup;$('#restore').onclick=()=>{if(importBusy){toast('正在读取文件，请稍后恢复备份');return;}$('#restoreFile').click();};
$('#restoreFile').onchange=async e=>{
  let restoring=false;
  try{const f=e.target.files[0];if(!f)return;if(f.size>25*1024*1024)throw Error('备份文件过大');if(importBusy)throw Error('正在读取文件，请稍后恢复备份');if(!save())return;importBusy=true;restoring=true;const restored=library.restore(JSON.parse(await f.text()));box=restored.box;query='';filter='all';page='weigh';result=null;render();toast(`已从备份新增 ${restored.count} 个箱子，原有箱子已保留`);}
  catch(err){toast('恢复失败：'+err.message);}finally{if(restoring)importBusy=false;e.target.value='';}
};
$('#newBox').onclick=openNewBox;
$('#boxManager').onclick=()=>{if(importBusy){toast('正在读取排表，请稍后切换箱子');return;}if(save())openBoxManager();};
$('#boxSwitch').onchange=e=>switchBox(e.target.value);

document.addEventListener('input',e=>{
  if(!['boxGross','boxFee','boxName'].includes(e.target.id)||page!=='settle')return;
  let node=document.querySelector('.result-head');
  if(!node)return;
  while(node){const next=node.nextSibling;node.remove();node=next;}
  const hint=document.createElement('p');hint.className='import-notice';hint.textContent='参数已修改，请点击「计算整团运费」更新结果。';$('#workspace').append(hint);
});
document.body.insertAdjacentHTML('beforeend','<dialog id="itemDialog" class="item-dialog"></dialog>');
let editorOrderId=null,editorItemId=null;
function ownerFields(owner={cn:'',qty:1}) {
  return `<div class="owner-fields"><label>归属 CN<input name="ownerCN" list="knownCNs" required maxlength="100" value="${esc(owner.cn)}" placeholder="选择或输入 CN"></label><label>数量<input name="ownerQty" type="number" min="1" step="1" required value="${owner.qty}"></label><button type="button" class="remove-owner" aria-label="移除此归属行" data-dialog-action="remove-owner">移除</button></div>`;
}
function showItemDialog(html) {
  const d=$('#itemDialog');d.innerHTML=html;if(!d.open)d.showModal();
}
function openItemEditor(o,itemId) {
  editorOrderId=o.id;editorItemId=itemId||null;
  const item=o.items.find(i=>i.id===itemId);
  showItemDialog(`<div class="dialog-heading"><h2>${item?'编辑商品':'手动添加商品'}</h2><button type="button" class="quiet" data-dialog-action="close">关闭</button></div><p class="dialog-note">订单：${esc(o.name)}。同一商品可分配给多位团员，单件重量会按各人数量套用。</p><form id="itemForm"><label class="form-label">商品名称<input id="editItemName" name="itemName" required maxlength="300" placeholder="填写完整商品名称" value="${esc(item?.name??'')}"></label><label class="form-label">单件重量（克，可稍后填写）<input id="editItemWeight" name="itemWeight" type="number" min="0.001" step="any" placeholder="未称重可留空" value="${esc(item?.weight??'')}"></label><div id="ownerFields">${(item?.owners??[{cn:'',qty:1}]).map(ownerFields).join('')}</div><datalist id="knownCNs">${[...new Set(box.orders.flatMap(members))].map(cn=>`<option value="${esc(cn)}"></option>`).join('')}</datalist><button type="button" class="text-button" data-dialog-action="add-owner">＋ 添加归属团员</button><p class="dialog-note">保存后，此订单需重新确认完成。按人合称时，涉及团员的合称重量会清空，请重新称重。</p><p id="itemFormError" class="warning" role="alert"></p><div class="dialog-footer"><button type="button" class="quiet" data-dialog-action="close">取消</button><button class="primary" type="submit">${item?'保存修改':'添加商品'}</button></div></form>`);
}
function openItemManager(o) {
  editorOrderId=o.id;
  showItemDialog(`<div class="dialog-heading"><h2>管理商品</h2><button class="quiet" data-dialog-action="close">关闭</button></div><p class="dialog-note">${esc(o.name)} · ${o.items.length} 个商品条目。删除后可在下方恢复。</p><div class="manager-items">${o.items.map(i=>`<div class="manager-row"><div><strong>${esc(i.name)}</strong><small>${i.owners.map(a=>`${esc(a.cn)} ×${a.qty}`).join('、')}</small></div><button class="quiet" data-dialog-action="edit" data-item-id="${esc(i.id)}">编辑</button><button class="delete" data-dialog-action="delete" data-item-id="${esc(i.id)}">删除</button></div>`).join('')||'<p class="dialog-note">当前没有商品，请添加商品或移除此订单。</p>'}</div><button class="quiet" data-dialog-action="add">＋ 手动添加商品</button><h3 class="deleted-heading">已删除商品（${o.deletedItems?.length??0}）</h3>${(o.deletedItems??[]).map(({item:i})=>`<div class="manager-row"><div><strong>${esc(i.name)}</strong><small>${i.owners.map(a=>`${esc(a.cn)} ×${a.qty}`).join('、')}</small></div><button class="quiet" data-dialog-action="restore" data-item-id="${esc(i.id)}">恢复商品</button></div>`).join('')||'<p class="dialog-note">暂无已删除商品</p>'}`);
}
function refreshChangedOrder(o) {
  save();renderStats();
  // Keep the changed order visible when editing from the completed filter.
  if(filter==='done')filter='all';
  renderOrders();
}
function removeItem(o,itemId) {
  try {const item=o.items.find(i=>i.id===itemId);if(!item)return;
    deleteItem(o,itemId);refreshChangedOrder(o);toast('商品已删除，可在“管理商品”中恢复；请核对订单总重');
  } catch(e){toast(e.message);}
}
$('#itemDialog').addEventListener('click',e=>{
  const b=e.target.closest('[data-dialog-action]');if(!b)return;
  const a=b.dataset.dialogAction,o=box.orders.find(v=>v.id===editorOrderId);
  if(a==='close'){$('#itemDialog').close();return;}
  if(a==='add-owner'){$('#ownerFields').insertAdjacentHTML('beforeend',ownerFields());return;}
  if(a==='remove-owner'){if($('#ownerFields').children.length>1)b.closest('.owner-fields').remove();else $('#itemFormError').textContent='至少保留一位归属团员';return;}
  if(!o)return;
  if(a==='edit')openItemEditor(o,b.dataset.itemId);
  if(a==='add')openItemEditor(o);
  if(a==='delete'){removeItem(o,b.dataset.itemId);openItemManager(o);}
  if(a==='restore'){try{restoreItem(o,b.dataset.itemId);refreshChangedOrder(o);openItemManager(o);toast('商品已恢复，请核对订单总重并重新完成称重');}catch(err){toast(err.message);}}
});
$('#itemDialog').addEventListener('submit',e=>{
  if(e.target.id!=='itemForm')return;e.preventDefault();
  const o=box.orders.find(v=>v.id===editorOrderId);if(!o)return;
  try {
    const owners=[...$('#ownerFields').children].map(row=>({cn:row.querySelector('[name="ownerCN"]').value,qty:row.querySelector('[name="ownerQty"]').value}));
    upsertItem(o,{name:$('#editItemName').value,weight:$('#editItemWeight').value,owners},editorItemId);
    $('#itemDialog').close();refreshChangedOrder(o);toast('商品已保存，请核对订单总重并重新完成称重');
  }catch(err){$('#itemFormError').textContent=err.message;}
});
function showStorageNotice(message){const node=$('#boxStorageNotice');node.hidden=false;node.textContent=message;}
function renderBoxPicker(){
  const picker=$('#boxSwitch');if(!library){picker.innerHTML='<option>本地数据暂不可读取</option>';picker.disabled=true;$('#newBox').disabled=true;$('#boxManager').disabled=true;return;}
  try{const boxes=library.list();picker.innerHTML=boxes.filter(b=>!b.archived||b.id===box.id).map(b=>`<option value="${esc(b.id)}" ${b.id===box.id?'selected':''}>${b.archived?'[已归档] ':''}${esc(b.id===box.id?box.name||'未命名箱子':b.name||'未命名箱子')} · ${b.orders.length} 单</option>`).join('');$('#boxManager').textContent=`管理箱子（${boxes.filter(b=>!b.archived).length}）`;let note=$('#archiveNotice');if(!note){note=document.createElement('p');note.id='archiveNotice';note.className='box-archive-notice';$('.box-bar').after(note);}note.hidden=!box.archived;note.innerHTML=box.archived?'当前查看的是已归档箱子，所有记录仍然保留。可在“管理箱子 → 已归档”中恢复；也可以新建箱子继续录入。':'';}
  catch(e){showStorageNotice(e.message);}
}
function switchBox(id){
  if(id===box.id)return;if(importBusy){toast('正在读取排表，请稍后切换箱子');renderBoxPicker();return;}
  if(!save()){renderBoxPicker();return;}
  try{box=library.switchBox(id);query='';filter='all';result=null;page='weigh';$('#boxStorageNotice').hidden=true;render();toast('已切换到：'+box.name);}
  catch(e){toast(e.message);renderBoxPicker();}
}
function openNewBox(){
  if(importBusy){toast('正在读取排表，请稍后新建箱子');return;}if(!library){toast('请先恢复本地数据');return;}
  const suggested='我的国际箱 · '+String(library.list().length+1).padStart(2,'0');
  $('#boxDialog').innerHTML=`<div class="dialog-heading"><h2>新建箱子</h2><button class="quiet" data-box-action="close">关闭</button></div><div class="box-dialog-body"><p class="dialog-note">现有箱子会继续保存，新箱子的订单、重量和运费单独记录。</p><form id="newBoxForm"><label>箱子名称<input id="newBoxName" maxlength="80" required value="${esc(suggested)}"></label><p id="newBoxError" class="warning" role="alert"></p><div class="dialog-footer"><button class="quiet" type="button" data-box-action="close">取消</button><button class="primary" type="submit">创建并切换</button></div></form></div>`;
  if(!$('#boxDialog').open)$('#boxDialog').showModal();
}
function boxState(b){if(!b.orders.length)return '空箱';if(!b.orders.every(o=>o.complete&&!orderCalc(o).error))return '称重中';try{settle(b);return '可结算';}catch{return '待结算';}}
let boxArchiveView=false;
function boxCards(query=''){
  const boxes=library.list().filter(b=>!!b.archived===boxArchiveView&&b.name.toLowerCase().includes(query.trim().toLowerCase()));
  return boxes.map(b=>`<article class="box-card ${b.id===box.id?'current':''}"><h3>${esc(b.name||'未命名箱子')}</h3><span class="box-state">${b.archived?'已归档 · ':''}${boxState(b)}</span>${b.archivedAt?`<small class="archive-date">归档于 ${esc(new Date(b.archivedAt).toLocaleDateString('zh-CN'))}</small>`:''}<p>${b.orders.length} 个订单 · ${new Set(b.orders.flatMap(members)).size} 位团员 · ${b.orders.reduce((n,o)=>n+totalQty(o),0)} 件<br>完成称重 ${b.orders.filter(o=>o.complete&&!orderCalc(o).error).length} / ${b.orders.length} 单<br>整箱重量：${hasWeight(b.gross)?fmt(b.gross)+' 克':'未填写'}　运费：${b.fee!==''&&b.fee!==null&&b.fee!==undefined&&Number.isFinite(Number(b.fee))&&Number(b.fee)>=0?'¥'+fmt(b.fee):'未填写'}</p><div class="box-card-actions"><button class="quiet" data-box-action="${b.archived?'unarchive':'archive'}" data-box-id="${esc(b.id)}" data-revision="${b.revision}">${b.archived?'恢复箱子':'归档'}</button><button class="quiet" data-box-action="backup-one" data-box-id="${esc(b.id)}">导出此箱备份</button><button class="primary" data-box-action="switch" data-box-id="${esc(b.id)}" ${b.id===box.id?'disabled':''}>${b.id===box.id?'当前箱子':b.archived?'查看此箱':'切换到此箱'}</button></div></article>`).join('')||`<p class="box-empty">${boxArchiveView?'暂无归档箱子':'暂无使用中的箱子，可新建箱子或从“已归档”中恢复'}${query?'（当前搜索范围内）':''}</p>`;
}
function openBoxManager(){
  boxArchiveView=!!box.archived;
  $('#boxDialog').innerHTML=`<div class="dialog-heading"><h2>我的箱子</h2><button class="quiet" data-box-action="close">关闭</button></div><div class="box-dialog-body"><p class="dialog-note">归档会收起箱子，商品、重量和运费全部保留，随时可以恢复。归档不代表已寄出或已收款。全部备份包含归档箱子。</p><div id="boxArchiveTabs" class="box-archive-tabs"></div><div class="box-dialog-tools"><input id="boxSearch" type="search" placeholder="搜索箱子名称" aria-label="搜索箱子"><button class="quiet" data-box-action="backup-all">备份全部箱子</button><button class="primary" data-box-action="new">新建箱子</button></div><div id="boxCards" class="box-cards"></div></div>`;
  refreshBoxManager();
  if(!$('#boxDialog').open)$('#boxDialog').showModal();
}
function refreshBoxManager(){const all=library.list();$('#boxArchiveTabs').innerHTML=[false,true].map(flag=>`<button class="${boxArchiveView===flag?'primary':'quiet'}" data-box-action="archive-view" data-archived="${flag}" aria-pressed="${boxArchiveView===flag}">${flag?'已归档':'使用中'}（${all.filter(b=>!!b.archived===flag).length}）</button>`).join('');$('#boxCards').innerHTML=boxCards($('#boxSearch').value);}
$('#boxDialog').addEventListener('input',e=>{if(e.target.id==='boxSearch')$('#boxCards').innerHTML=boxCards(e.target.value);});
$('#boxDialog').addEventListener('click',e=>{
  const b=e.target.closest('[data-box-action]');if(!b)return;const action=b.dataset.boxAction;
  if(action==='close')$('#boxDialog').close();if(action==='new')openNewBox();if(action==='backup-all')backup();
  if(action==='archive-view'){boxArchiveView=b.dataset.archived==='true';refreshBoxManager();}
  if(action==='archive'||action==='unarchive'){
    if(importBusy){toast('正在读取文件，请稍后归档或恢复');return;}
    try{const id=b.dataset.boxId,revision=Number(b.dataset.revision);if(!save())return;box=library.setArchived(id,action==='archive',revision);query='';filter='all';result=null;render();refreshBoxManager();toast(action==='archive'?'已归档，记录已保留，可在“已归档”中恢复':'已恢复到使用中的箱子');}
    catch(e){toast(e.message);refreshBoxManager();}
  }
  if(action==='switch'){const before=box.id;switchBox(b.dataset.boxId);if(box.id!==before)$('#boxDialog').close();}
  if(action==='backup-one'){try{const chosen=b.dataset.boxId===box.id?box:library.get(b.dataset.boxId);download(new Blob([JSON.stringify(chosen,null,2)],{type:'application/json'}),chosen.name+'-单箱备份.json');}catch(e){toast(e.message);}}
});
$('#boxDialog').addEventListener('submit',e=>{
  if(e.target.id!=='newBoxForm')return;e.preventDefault();
  try{const name=$('#newBoxName').value.trim();if(!name)throw Error('请填写箱子名称');if(!save())throw Error('当前箱子尚未保存，请先导出备份或处理保存问题');box=library.createBox(name);query='';filter='all';page='weigh';result=null;$('#boxDialog').close();render();toast('已新建箱子，原箱子已保留');}
  catch(err){$('#newBoxError').textContent=err.message;}
});
window.addEventListener('storage',e=>{
  if(!library)return;
  if(e.key===BOXES_KEY){try{const latest=library.get(box.id);if(latest.revision!==box.revision)showStorageNotice('此箱已在另一个页面更新。请先导出全部备份，再刷新，避免覆盖新进度。');renderBoxPicker();}catch(err){showStorageNotice(err.message);}}
  if(e.key===LEGACY_KEY)showStorageNotice('有旧版页面修改了单箱记录。请先在旧页面导出备份，再刷新旧页面；新版箱子列表已分别保留。');
});
render();

function refreshOwnerRows(section,o) {
  for(const cell of section.querySelectorAll('[data-owner-total]')) {
    const item=o.items.find(i=>i.id===cell.dataset.itemId),owner=item?.owners.find(a=>a.cn===cell.dataset.cn);
    if(!owner)continue;
    const total=ownerWeight(item,owner);cell.textContent=total===null?'待填写':fmt(total,2);
    const input=cell.closest('tr').querySelector('[data-override-item]');
    if(input&&document.activeElement!==input)input.value=unitWeight(item,owner.cn)??'';
  }
}

function itemOwnerRows(o) {
  return o.items.map((item,index)=>item.owners.map((owner,ownerIndex)=>`<tr>
    <td class="item-name">${esc(item.name)}<small>条目 ${String(index+1).padStart(2,'0')}${item.manual?' · 手动添加':''}</small><div class="item-actions"><button data-action="rename-item" data-item-id="${esc(item.id)}">修改名称</button>${ownerIndex===0?`<button data-action="edit-item" data-item-id="${esc(item.id)}">编辑数量 / 归属</button><button data-action="delete-item" data-item-id="${esc(item.id)}">删除商品</button>`:''}</div></td>
    <td class="quantity">${owner.qty}</td><td class="owner owner-cn">${esc(owner.cn)}</td>
    <td><input class="weight" type="number" min="0.001" step="any" data-override-item="${esc(item.id)}" data-cn="${esc(owner.cn)}" aria-label="${esc(item.name)} ${esc(owner.cn)}单件克重" placeholder="待填写" value="${esc(unitWeight(item,owner.cn)??'')}"></td>
  </tr>`).join('')).join('');
}
function openRenameItem(o,itemId) {
  const item=o.items.find(i=>i.id===itemId);if(!item)return;
  editorOrderId=o.id;editorItemId=itemId;
  showItemDialog(`<div class="dialog-heading"><h2>修改商品名称</h2><button type="button" class="quiet" data-dialog-action="close">关闭</button></div><form id="renameItemForm"><label class="form-label">商品名称<input id="renameItemName" required maxlength="300" value="${esc(item.name)}"></label><p class="dialog-note">同一商品的所有团员行会同步改名，数量、归属和已填克重保持不变。</p><p id="renameItemError" class="warning" role="alert"></p><div class="dialog-footer"><button type="button" class="quiet" data-dialog-action="close">取消</button><button type="submit" class="primary">保存名称</button></div></form>`);
}
$('#itemDialog').addEventListener('submit',e=>{
  if(e.target.id!=='renameItemForm')return;e.preventDefault();
  const o=box.orders.find(v=>v.id===editorOrderId);if(!o)return;
  try{renameItem(o,editorItemId,$('#renameItemName').value);save();$('#itemDialog').close();renderOrders();toast('商品名称已更新，重量和分摊数据已保留');}
  catch(err){$('#renameItemError').textContent=err.message;}
});

function importReviewedOrder(order){
  if(order.imageDraftId&&box.orders.some(o=>o.imageDraftId===order.imageDraftId))throw Error('此图片草稿已经导入，请在订单列表中查看');
  if(order.imageSourceHash&&box.orders.some(o=>o.imageSourceHash===order.imageSourceHash))throw Error('这张图片已导入当前箱子，请直接修改已有订单');
  if(order.mergeSourceHash&&box.orders.some(o=>o.mergeSourceHash===order.mergeSourceHash))throw Error('这份排表已经合并导入当前箱子，请直接修改已有订单，避免重复计算');
  const next={...box,orders:[...box.orders,order]};
  persistBox(next);result=null;page='weigh';query='';filter='all';render();toast('核对已确认，订单已导入，可开始录入重量');
}
installImageImport({getCNs:()=>[...new Set(box.orders.flatMap(members))],getBoxName:()=>box.name,importOrder:importReviewedOrder});
installCNSummary({getBoxName:()=>box.name,importOrder:importReviewedOrder});

installMemberQuery({getBoxes:()=>{if(importBusy)throw Error('正在读取文件，请稍后查询');if(!save())throw Error('请先处理保存失败，再查询已保存的箱子');return library.list();},toast});

installOrderNotes({getBox:()=>box,saveOrder:changed=>{persistBox({...box,orders:box.orders.map(o=>o.id===changed.id?changed:o)});render();},toast});
