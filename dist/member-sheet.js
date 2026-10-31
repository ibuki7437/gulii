// This explicit field selection keeps the leader's internal tasks out of shared sheets.
export function memberSheetBlocks(report){
  return report.boxes.flatMap(b=>[
    {kind:'box',text:b.name+(b.archived?'（已归档）':'')+` · ${b.qty} 件`},
    ...b.orders.flatMap((o,index)=>[
      {kind:'order',text:o.order,label:'订单 '+String(index+1).padStart(2,'0')},
      ...(o.note?[{kind:'note',text:'订单备注：'+o.note}]:[]),
      ...b.items.filter(i=>i.orderId===o.orderId).map(i=>({kind:'item',text:i.product,qty:i.qty})),
      ...[...new Set(b.items.filter(i=>i.orderId===o.orderId&&i.note).map(i=>i.note))].map(text=>({kind:'note',text:'商品备注：'+text}))
    ])
  ]);
}
export function wrapText(text,measure,max){const lines=[];for(const paragraph of String(text).split('\n')){let line='';for(const char of paragraph){if(line&&measure(line+char)>max){lines.push(line);line=char;}else line+=char;}lines.push(line);}return lines;}
const rowFont=kind=>kind==='box'?'600 23px sans-serif':kind==='order'?'600 19px sans-serif':kind==='note'?'18px sans-serif':'24px sans-serif';
const rowWidth=kind=>kind==='item'?640:kind==='order'?670:kind==='note'?740:780;
const rowStep=kind=>kind==='box'?46:kind==='order'?32:kind==='note'?28:44;
export function layoutMemberSheet(report,measure){
  const pages=[[]],start=202+wrapText(report.cn,t=>measure(t,'cn'),760).length*30;let y=start,lastBox=null,lastOrder=null;
  function add(block,text,first=true){pages.at(-1).push({...block,text,first,qty:first?block.qty:undefined,y});y+=rowStep(block.kind);}
  function newPage(block){pages.push([]);y=start;
    const context=[];
    if(block.kind!=='box'&&lastBox)context.push({...lastBox,text:lastBox.text+'（续）'});
    if(block.kind!=='box'&&block.kind!=='order'&&lastOrder)context.push({...lastOrder,text:lastOrder.text+'（续）'});
    for(const head of context){wrapText(head.text,t=>measure(t,head.kind),rowWidth(head.kind)).forEach((text,n)=>add(head,text,n===0));y+=8;}
  }
  for(const block of memberSheetBlocks(report)){
    const lines=wrapText(block.text,t=>measure(t,block.kind),rowWidth(block.kind));
    const reserve=block.kind==='box'?100:block.kind==='order'?44:0;
    if(reserve&&y+lines.length*rowStep(block.kind)+reserve>1250&&pages.at(-1).length)newPage(block);
    for(let n=0;n<lines.length;n++){
      if(y+38>1260)newPage(block);
      add(block,lines[n],n===0);
    }y+=block.kind==='order'?6:10;if(block.kind==='box'){lastBox=block;lastOrder=null;}if(block.kind==='order')lastOrder=block;
  }return pages;
}
export async function showMemberSheet(report){
  if(!report.boxes.length)throw Error('没有可生成核对单的商品');await document.fonts.ready;
  const old=document.querySelector('#memberSheetDialog');if(old)old.remove();
  const dialog=document.createElement('dialog');dialog.id='memberSheetDialog';dialog.className='sheet-dialog';
  const head=document.createElement('div');head.className='dialog-heading';const h=document.createElement('h2');h.textContent='团员核对单预览';head.append(h);const close=document.createElement('button');close.className='quiet';close.textContent='关闭';close.onclick=()=>dialog.close();head.append(close);dialog.append(head);
  const hint=document.createElement('p');hint.className='dialog-note';hint.textContent='仅包含所选 CN 的商品和公开备注，不包含团长待办。请核对后逐页下载图片，尚未结算也能生成。';dialog.append(hint);
  const ctx=document.createElement('canvas').getContext('2d');const pages=layoutMemberSheet(report,(t,kind)=>{ctx.font=kind==='cn'?'24px sans-serif':rowFont(kind);return ctx.measureText(t).width;});
  for(let index=0;index<pages.length;index++){
    const height=Math.max(400,(pages[index].at(-1)?.y||230)+115),canvas=document.createElement('canvas');canvas.width=1800;canvas.height=height*2;const c=canvas.getContext('2d');c.scale(2,2);c.fillStyle='#fafbf7';c.fillRect(0,0,900,height);c.fillStyle='#456b57';c.font='bold 30px sans-serif';c.fillText('团员商品核对单',50,55);c.font='24px sans-serif';
    // CN and box names wrap instead of shrinking or clipping.
    const cnLines=wrapText(report.cn,t=>c.measureText(t).width,760);cnLines.forEach((s,n)=>c.fillText(s,50,95+n*30));c.font='18px sans-serif';c.fillText(`${report.boxes.length} 箱 · ${report.orderCount} 单 · ${report.qty} 件  /  第 ${index+1} / ${pages.length} 页`,50,112+cnLines.length*30);
    c.font='16px sans-serif';c.fillStyle='#7a856e';c.fillText('商品名称',82,152+cnLines.length*30);c.textAlign='right';c.fillText('数量',830,152+cnLines.length*30);c.textAlign='left';
    for(const row of pages[index]){
      const y=row.y;c.font=rowFont(row.kind);
      if(row.kind==='box'){c.fillStyle='#456b57';c.fillRect(40,y-28,820,44);c.fillStyle='#fff';c.fillText(row.text,58,y);}
      else if(row.kind==='order'){c.fillStyle='#e9eee4';c.fillRect(50,y-23,800,32);if(row.first){c.font='15px sans-serif';c.fillStyle='#65805d';c.fillText(row.label,64,y-1);}c.font=rowFont('order');c.fillStyle='#51614b';c.fillText(row.text,160,y);}
      else if(row.kind==='note'){c.fillStyle='#7a856e';c.fillText(row.text,82,y);}
      else{c.fillStyle='#fff';c.fillRect(64,y-28,786,44);c.fillStyle='#293c31';c.fillText(row.text,82,y);if(row.qty!==undefined){c.textAlign='right';c.font='600 22px sans-serif';c.fillStyle='#456b57';c.fillText('× '+row.qty,830,y);c.textAlign='left';}}
    }
    c.fillStyle='#7a856e';c.font='17px sans-serif';c.fillText('请核对商品名称、分箱及数量，有出入请联系团长。',50,height-45);c.fillText('生成于 '+new Date().toLocaleString('zh-CN'),50,height-17);
    const section=document.createElement('section');section.className='sheet-page';const button=document.createElement('button');button.className='primary';button.textContent=`下载第 ${index+1} 页 PNG`;button.onclick=()=>canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=report.cn.replace(/[\\/:*?"<>|]/g,'_')+`-商品核对单-${index+1}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);},'image/png');section.append(button,canvas);dialog.append(section);
  }
  document.body.append(dialog);dialog.showModal();
}
