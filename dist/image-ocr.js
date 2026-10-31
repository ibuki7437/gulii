import {recognizeLocalGrid} from './local-ocr-client.js';
import {suggestRowTypes} from './image-data.js';

export function findLines(pixels,width,height,axis){
  const length=axis==='x'?width:height,other=axis==='x'?height:width;
  const white=new Float64Array(length),dark=new Float64Array(length);
  for(let a=0;a<length;a++)for(let b=0;b<other;b++){
    const x=axis==='x'?a:b,y=axis==='x'?b:a,p=(y*width+x)*4;
    const lum=.299*pixels[p]+.587*pixels[p+1]+.114*pixels[p+2];
    if(Math.min(pixels[p],pixels[p+1],pixels[p+2])>230)white[a]++;if(lum<90)dark[a]++;
  }
  const candidates=[];
  for(let a=0;a<length;a++){
    const near=Math.max(3,Math.round(length/150));
    const left=Math.max(0,a-near),right=Math.min(length-1,a+near);
    const peakW=white[a]/other>.34&&white[a]-Math.min(white[left],white[right])>other*.25;
    const peakD=dark[a]/other>.65&&dark[a]-Math.min(dark[left],dark[right])>other*.3;
    let transition=false;
    if(axis==='y'&&a>=2){let changed=0;for(let x=0;x<width;x++){const p=(a*width+x)*4,q=((a-2)*width+x)*4;if(Math.abs(pixels[p]-pixels[q])+Math.abs(pixels[p+1]-pixels[q+1])+Math.abs(pixels[p+2]-pixels[q+2])>45)changed++;}transition=changed/width>.4;}
    if(peakW||peakD||transition)candidates.push(a);
  }
  const groups=[];for(const a of candidates){const last=groups.at(-1);if(last&&a-last.at(-1)<=3)last.push(a);else groups.push([a]);}
  let lines=groups.map(g=>Math.round(g.reduce((s,x)=>s+x,0)/g.length));
  lines=lines.filter((n,i)=>!i||n-lines[i-1]>=8);
  if(!lines.length||lines[0]>length*.08)lines.unshift(0);
  if(lines.at(-1)<length*.92)lines.push(length-1);
  return lines;
}

export async function loadPicture(file){
  if(file.size>15*1024*1024)throw Error('图片超过 15 MB，请先压缩或裁剪');
  if(!/^image\/(png|jpeg|webp|bmp)$/.test(file.type))throw Error('请选择 PNG、JPG、WebP 或 BMP 图片');
  const url=URL.createObjectURL(file),image=new Image();
  try{image.src=url;await image.decode();if(image.width*image.height>24000000)throw Error('图片尺寸过大，请裁剪后重试');return {url,image};}
  catch(e){URL.revokeObjectURL(url);throw e;}
}

export function detectGrid(image){
  const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,c.width,c.height).data;
  let xs=findLines(pixels,c.width,c.height,'x'),ys=findLines(pixels,c.width,c.height,'y');
  const reliable=xs.length>=3&&xs.length<=31&&ys.length>=3&&ys.length<=101;
  if(!reliable){xs=Array.from({length:10},(_,i)=>Math.round(i*(c.width-1)/9));ys=Array.from({length:13},(_,i)=>Math.round(i*(c.height-1)/12));}
  return {xs,ys,reliable};
}

export function prepareOCR(image,{xs,ys}){
  const source=document.createElement('canvas');source.width=image.width;source.height=image.height;
  const s=source.getContext('2d',{willReadFrequently:true});s.drawImage(image,0,0);
  const cols=xs.length-1,rows=ys.length-1,cw=310,ch=110;
  const canvas=document.createElement('canvas');canvas.width=cols*cw;canvas.height=rows*ch;
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const x=xs[col]+2,y=ys[row]+2,w=Math.max(1,xs[col+1]-x-2),h=Math.max(1,ys[row+1]-y-2);
    const crop=s.getImageData(x,y,w,h),d=crop.data;
    // Sample the background near the cell corners, away from centered text.
    const sample=Math.min(d.length-4,(Math.min(2,h-1)*w+Math.min(2,w-1))*4);
    const background=.299*d[sample]+.587*d[sample+1]+.114*d[sample+2];
    const invert=background<170&&d[sample+2]>d[sample]+25;
    for(let p=0;p<d.length;p+=4){const lum=.299*d[p]+.587*d[p+1]+.114*d[p+2],value=invert?Math.max(0,255-Math.max(0,lum-background)*255/(255-background)):Math.min(255,lum*255/190);d[p]=d[p+1]=d[p+2]=Math.round(value);d[p+3]=255;}
    const cell=document.createElement('canvas');cell.width=w;cell.height=h;cell.getContext('2d').putImageData(crop,0,0);
    const scale=Math.min((cw-20)/w,(ch-24)/h,4);
    ctx.drawImage(cell,col*cw+(cw-w*scale)/2,row*ch+(ch-h*scale)/2,w*scale,h*scale);
  }
  return {canvas,cw,ch,rows,cols};
}

let loadingScript;
function loadEngine(){
  if(window.Tesseract)return Promise.resolve();
  if(!loadingScript)loadingScript=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='ocr/tesseract.min.js';s.onload=resolve;s.onerror=()=>{loadingScript=null;reject(Error('识别组件加载失败，请检查网络后重试'));};document.head.append(s);});
  return loadingScript;
}
export async function recognizeGrid(image,bounds,onProgress,signal,options={}){
  if(options.engine==='local')return recognizeLocalGrid(image,bounds,onProgress,signal,options.token);
  await loadEngine();if(signal.aborted)throw Error('识别已取消');
  onProgress('准备识别图片…');const prepared=prepareOCR(image,bounds);
  let worker;
  const abort=()=>{if(worker)worker.terminate().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{
    const origin=new URL('ocr/',location.href).href;
    worker=await Tesseract.createWorker('chi_sim',1,{workerPath:origin+'worker.min.js',corePath:origin+'core',langPath:origin+'lang',cachePath:'gutuan-chi-best-v1',gzip:false,workerBlobURL:false,logger:m=>onProgress(m.status==='recognizing text'?`正在识别 ${Math.round(m.progress*100)}%`:'正在加载本地中文识别组件…')});
    if(signal.aborted)throw Error('识别已取消');
    await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1',user_defined_dpi:'300'});
    const {data}=await worker.recognize(prepared.canvas.toDataURL('image/png'),{}, {tsv:true,text:true});
    if(signal.aborted)throw Error('识别已取消');
    const buckets=Array.from({length:prepared.rows},()=>Array.from({length:prepared.cols},()=>[]));
    for(const line of (data.tsv??'').split('\n').slice(1)){
      const parts=line.split('\t');if(parts.length<12||parts[0]!=='5')continue;
      const [left,top,w,h,conf]=parts.slice(6,11).map(Number),text=parts.slice(11).join('\t').trim();if(!text)continue;
      const col=Math.floor((left+w/2)/prepared.cw),row=Math.floor((top+h/2)/prepared.ch);
      if(buckets[row]?.[col])buckets[row][col].push({text,left,conf});
    }
    const grid=buckets.map(row=>row.map(cell=>cell.sort((a,b)=>a.left-b.left).map(w=>w.text).join('')));
    const confidence=buckets.map(row=>row.map(cell=>cell.length?Math.min(...cell.map(w=>w.conf)):0));
    // Short CNs work better as individual lines than as one page of widely spaced text.
    await worker.setParameters({tessedit_pageseg_mode:'7'});
    const cell=document.createElement('canvas');cell.width=prepared.cw;cell.height=prepared.ch;
    const context=cell.getContext('2d',{willReadFrequently:true});
    let completed=0;
    for(let row=0;row<prepared.rows;row++)for(let col=0;col<prepared.cols;col++){
      if(signal.aborted)throw Error('识别已取消');
      context.clearRect(0,0,cell.width,cell.height);context.drawImage(prepared.canvas,col*prepared.cw,row*prepared.ch,prepared.cw,prepared.ch,0,0,prepared.cw,prepared.ch);
      const pixels=context.getImageData(0,0,cell.width,cell.height).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<150)ink++;
      if(ink<12){grid[row][col]='';confidence[row][col]=100;}
      else {const result=await worker.recognize(cell.toDataURL('image/png'),{},{text:true});const text=result.data.text.replace(/\s+/g,'').trim(),score=result.data.confidence??0;if(text&&(score>confidence[row][col]||!grid[row][col])){grid[row][col]=text;confidence[row][col]=score;}}
      onProgress(`逐格核对识别 ${++completed}/${prepared.rows*prepared.cols}`);
    }
    return {grid,confidence,types:suggestRowTypes(grid)};
  }finally{signal.removeEventListener('abort',abort);if(worker)await worker.terminate().catch(()=>{});}
}
