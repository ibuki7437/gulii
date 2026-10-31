@echo off
chcp 65001 >nul
setlocal
pushd "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 尚未找到 Node.js。首次使用请先安装一次 Node.js LTS 版本。
  echo 官方下载地址：https://nodejs.org/zh-cn/download
  echo 请选择 Windows 安装程序 .msi，保持默认选项完成安装。
  echo 安装后关闭此窗口，再重新双击“启动谷里”。
  echo 详细步骤见“先看这里-使用说明.html”。
  pause
  popd
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<22){console.error('Node.js 版本太旧，请到官网下载当前 LTS 版并安装后重试。');process.exit(1)}"
if errorlevel 1 (
  pause
  popd
  exit /b 1
)
node scripts\serve.mjs --open
if errorlevel 1 pause
popd
endlocal
