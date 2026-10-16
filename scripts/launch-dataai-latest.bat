@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title DataAI 最新版

set "TS_MAIN=E:\pythonProjects\db-ai\apps\desktop"
set "TS_M2=E:\pythonProjects\db-ai\_ts_workspace\db-ai-pro-m2\apps\desktop"
set "EXE_ELECTRON=E:\pythonProjects\db-ai\electron\dist\win-unpacked\DataAI.exe"
set "EXE_PYQT=E:\pythonProjects\db-ai\dist\DataAI.exe"
set "PY=E:\pythonProjects\db-ai\.venv\Scripts\python.exe"
set "MAINPY=E:\pythonProjects\db-ai\src\main.py"

where npm >nul 2>&1
set "HAS_NPM=%ERRORLEVEL%"

REM 0) 优先：TS 桌面 tip / portable（release 或 dist 下最新 DataAI-*-win-tip.exe）
set "TIP_EXE="
for %%D in ("%TS_M2%\release" "%TS_MAIN%\release" "%TS_M2%\dist" "%TS_MAIN%\dist") do (
  if exist %%~D\ (
    for /f "delims=" %%F in ('dir /b /a:-d /o:-d "%%~D\DataAI-*-win-tip.exe" 2^>nul') do (
      if not defined TIP_EXE set "TIP_EXE=%%~D\%%F"
    )
  )
)
if defined TIP_EXE (
  echo [DataAI] 启动 tip/portable: !TIP_EXE!
  start "" "!TIP_EXE!"
  exit /b 0
)

REM 0b) win-unpacked tip（若 pack 产出目录结构不同）
for %%D in ("%TS_M2%\release\win-unpacked" "%TS_MAIN%\release\win-unpacked") do (
  if exist "%%~D\DataAI.exe" (
    echo [DataAI] 启动 win-unpacked: %%~D\DataAI.exe
    start "" "%%~D\DataAI.exe"
    exit /b 0
  )
)

REM 1) M2 工作区 TS 桌面（真相源，有依赖则直接跑）
if exist "%TS_M2%\package.json" if exist "%TS_M2%\node_modules" (
  echo [DataAI] 启动最新 TS 桌面: %TS_M2%
  cd /d "%TS_M2%"
  call npm run dev
  exit /b %ERRORLEVEL%
)

REM 2) 正式仓库 TS 桌面（有依赖则直接跑）
if exist "%TS_MAIN%\package.json" if exist "%TS_MAIN%\node_modules" (
  echo [DataAI] 启动最新 TS 桌面: %TS_MAIN%
  cd /d "%TS_MAIN%"
  call npm run dev
  exit /b %ERRORLEVEL%
)

REM 3) M2 有源码但缺依赖：尝试 npm install --ignore-scripts 后启动
if exist "%TS_M2%\package.json" if "%HAS_NPM%"=="0" (
  echo [DataAI] M2 TS 缺依赖，正在 npm install --ignore-scripts…
  cd /d "%TS_M2%"
  call npm install --ignore-scripts
  if errorlevel 1 (
    echo [错误] npm install 失败
    pause
    exit /b 1
  )
  call npm run dev
  exit /b %ERRORLEVEL%
)

REM 4) 主仓库有 TS 源码但缺依赖
if exist "%TS_MAIN%\package.json" if "%HAS_NPM%"=="0" (
  echo [DataAI] 主仓库 TS 缺依赖，正在 npm install --ignore-scripts…
  cd /d "%TS_MAIN%"
  call npm install --ignore-scripts
  if errorlevel 1 (
    echo [错误] npm install 失败
    pause
    exit /b 1
  )
  call npm run dev
  exit /b %ERRORLEVEL%
)

REM 5) 已打包 Electron win-unpacked（legacy electron/）
if exist "%EXE_ELECTRON%" (
  echo [DataAI] 启动已打包 Electron: %EXE_ELECTRON%
  start "" "%EXE_ELECTRON%"
  exit /b 0
)

REM 6) PyQt 打包 exe
if exist "%EXE_PYQT%" (
  echo [DataAI] 启动 PyQt 打包版: %EXE_PYQT%
  start "" "%EXE_PYQT%"
  exit /b 0
)

REM 7) venv + src/main.py
if exist "%PY%" if exist "%MAINPY%" (
  echo [DataAI] 启动 Python 源码: %MAINPY%
  cd /d "E:\pythonProjects\db-ai"
  "%PY%" "%MAINPY%"
  exit /b %ERRORLEVEL%
)

echo [错误] 未找到可启动的 DataAI 目标。
pause
exit /b 1
