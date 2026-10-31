export const orderNote=o=>typeof o.note==='string'?o.note:'';
export const tasks=o=>Array.isArray(o.tasks)?o.tasks.filter(t=>t&&typeof t.text==='string'&&!t.removed):[];
export const pendingTasks=b=>b.orders.flatMap(o=>tasks(o).filter(t=>!t.done).map(t=>({orderId:o.id,order:o.name,id:t.id,text:t.text})));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const notesButton=o=>`<button class="quiet order-notes-button" data-notes-order="${esc(o.id)}">备注 / 待办${tasks(o).some(t=>!t.done)?` · ${tasks(o).filter(t=>!t.done).length} 项待办`:orderNote(o)?' · 有备注':''}</button>`;
export function pendingNotice(box){const count=pendingTasks(box).length;return count?`<div class="pending-notice"><span>本箱还有 <strong>${count}</strong> 项待办未完成，请在结算前核对。</span><button class="quiet" data-notes-all>查看待办</button><small>待办仅作提醒，不影响称重和运费计算。</small></div>`:'';}
export function updateNotes(order,note,todo){
  if(typeof note!=='string'||note.length>2000)throw Error('订单备注最多 2000 字');
  if(!Array.isArray(todo)||todo.length>200)throw Error('每单最多保存 200 项待办（含已移除项）');
  const ids=new Set();const clean=todo.map(t=>{if(typeof t.id!=='string'||!t.id||ids.has(t.id)||typeof t.text!=='string'||!t.text.trim()||t.text.length>300)throw Error('请填写待办内容，每项最多 300 字');ids.add(t.id);return {id:t.id,text:t.text.trim(),done:!!t.done,removed:!!t.removed};});
  return {...order,note:note.trim(),tasks:clean};
}
