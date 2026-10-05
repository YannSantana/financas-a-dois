@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 22 ou mais recente em https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  call npm install
  if errorlevel 1 exit /b 1
)
echo Abra http://localhost:3000 quando o servidor estiver pronto.
echo Mantenha esta janela aberta durante o uso. Para encerrar, pressione Ctrl+C.
call npm run dev:local
pause
