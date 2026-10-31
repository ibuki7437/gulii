import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('../dist/',import.meta.url)).replace(/[\\/]+$/,''),port=Number(process.env.PORT||8080);
if(!Number.isInteger(port)||port<1||port>65535){console.error('启动失败：端口设置无效。请使用默认启动文件。');process.exit(1);}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8','.traineddata':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');let rel=decodeURIComponent(url.pathname);if(rel==='/')rel='/index.html';
    const target=path.resolve(root,'.'+rel);
    if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const data=await fs.readFile(target);
    res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'启动失败：这个地址已被占用。请先检查谷里是否已经打开；不要反复双击启动。':'启动失败：'+e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{
  const url=`http://127.0.0.1:${port}`;
  console.log(`谷里已启动：${url}\n浏览器没打开时，请复制上面的地址到浏览器。\n使用期间请保留这个窗口，可以最小化。结束后按 Ctrl+C，或关闭此窗口。\n订单保存在当前浏览器中，退出前记得导出备份。`);
  if(process.argv.includes('--open')&&process.env.GULII_NO_OPEN!=='1'){
    const command=process.platform==='win32'?['cmd.exe',['/c','start','',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
    const child=spawn(command[0],command[1],{windowsHide:true,stdio:'ignore'});child.on('error',()=>console.log('请手动在浏览器打开：'+url));child.unref();
  }
});
