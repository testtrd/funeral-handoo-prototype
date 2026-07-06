@echo off
setlocal
cd /d "%~dp0"
"C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "node_modules\next\dist\bin\next" dev -p 3000 --hostname 127.0.0.1
