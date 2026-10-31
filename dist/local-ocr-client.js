import {suggestRowTypes} from './image-data.js';
export const LOCAL_OCR_URL='http://127.0.0.1:18765';
export async function connectLocalOCR(token){
  if(!/^[a-f0-9]{16}$/i.test(token.trim()))throw Error('请复制本地工具页面中的 16 位连接码');
  try{
    const response=await fetch(LOCAL_OCR_URL+'/api/connect',{headers:{'X-Local-Token':token.trim()},signal:AbortSignal.timeout(8000),targetAddressSpace:'loopback'});
    const status=await response.json();if(!response.ok)throw Error(status.error||'连接失败');
    if(!status.ready)throw Error(status.error||'本地模型正在加载，请稍后再连接');
    return status;
  }catch(e){if(e.name==='TypeError'||e.name==='TimeoutError')throw Error('未连上本地 OCR。请先双击启动文件，并在浏览器询问时允许此网页连接本机服务；也可打开本地工具单独识别。');throw e;}
}
export async function recognizeLocalGrid(image,bounds,onProgress,signal,token){
  if(!token)throw Error('请先连接本地 OCR');
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);
  onProgress('本机 PaddleOCR 正在逐格识别，请稍等（约 1–2 分钟）…');
  let response;
  try{response=await fetch(LOCAL_OCR_URL+'/api/recognize',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':token},body:JSON.stringify({image:canvas.toDataURL('image/png'),bounds}),signal,targetAddressSpace:'loopback'});}
  catch(e){if(signal.aborted)throw Error('识别已取消或超时');throw Error('本地 OCR 连接中断，请检查启动窗口或重新连接。此次未导入订单。');}
  const data=await response.json();if(!response.ok)throw Error(data.error||'本地识别失败');
  if(!Array.isArray(data.grid)||!Array.isArray(data.confidence))throw Error('本地识别结果格式不正确');
  return {...data,types:suggestRowTypes(data.grid)};
}
