@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title DataAI Latest

set "TS_MAIN=E:\pythonProjects\db-ai\apps\desktop"
set "TS_M2=E:\pythonProjects\db-ai\_ts_workspace\db-ai-pro-m2\apps\desktop"
set "EXE_ELECTRON=E:\pythonProjects\db-ai\electron\dist\win-unpacked\DataAI.exe"
set "EXE_PYQT=E:\pythonProjects\db-ai\dist\DataAI.exe"
set "PY=E:\pythonProjects\db-ai\.venv\Scripts\python.exe"
set "MAINPY=E:\pythonProjects\db-ai\src\main.py"

where npm >nul 2>&1
set "HAS_NPM=%ERRORLEVEL%"

REM 1) Prefer M2 TS desktop (source of truth) when node_modules present
if exist "%TS_M2%\package.json" if exist "%TS_M2%\node_modules" (
  echo [DataAI] starting M2 TS desktop: %TS_M2%
  cd /d "%TS_M2%"
  call npm run dev
  exit /b %ERRORLEVEL%
)

REM 2) Main-repo TS desktop when node_modules present
if exist "%TS_MAIN%\package.json" if exist "%TS_MAIN%\node_modules" (
  echo [DataAI] starting main TS desktop: %TS_MAIN%
  cd /d "%TS_MAIN%"
  call npm run dev
  exit /b %ERRORLEVEL%
)

REM 3) tip / portable when source env unavailable
set "TIP_EXE="
for %%D in ("%TS_M2%\release" "%TS_MAIN%\release" "%TS_M2%\dist" "%TS_MAIN%\dist") do (
  if exist %%~D\ (
    for /f "delims=" %%F in ('dir /b /a:-d /o:-d "%%~D\DataAI-*-win-tip.exe" 2^>nul') do (
      if not defined TIP_EXE set "TIP_EXE=%%~D\%%F"
    )
  )
)
if defined TIP_EXE (
  echo [DataAI] starting tip/portable: !TIP_EXE!
  start "" "!TIP_EXE!"
  exit /b 0
)

for %%D in ("%TS_M2%\release\win-unpacked" "%TS_MAIN%\release\win-unpacked") do (
  if exist "%%~D\DataAI.exe" (
    echo [DataAI] starting win-unpacked: %%~D\DataAI.exe
    start "" "%%~D\DataAI.exe"
    exit /b 0
  )
)

REM 4) M2 missing deps: npm install then dev
if exist "%TS_M2%\package.json" if "%HAS_NPM%"=="0" (
  echo [DataAI] M2 missing deps, npm install --ignore-scripts...
  cd /d "%TS_M2%"
  call npm install --ignore-scripts
  if errorlevel 1 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
  )
  call npm run dev
  exit /b %ERRORLEVEL%
)

if exist "%TS_MAIN%\package.json" if "%HAS_NPM%"=="0" (
  echo [DataAI] main TS missing deps, npm install --ignore-scripts...
  cd /d "%TS_MAIN%"
  call npm install --ignore-scripts
  if errorlevel 1 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
  )
  call npm run dev
  exit /b %ERRORLEVEL%
)

if exist "%EXE_ELECTRON%" (
  echo [DataAI] starting packed Electron: %EXE_ELECTRON%
  start "" "%EXE_ELECTRON%"
  exit /b 0
)

if exist "%EXE_PYQT%" (
  echo [DataAI] starting PyQt build: %EXE_PYQT%
  start "" "%EXE_PYQT%"
  exit /b 0
)

if exist "%PY%" if exist "%MAINPY%" (
  echo [DataAI] starting Python source: %MAINPY%
  cd /d "E:\pythonProjects\db-ai"
  "%PY%" "%MAINPY%"
  exit /b %ERRORLEVEL%
)

echo [ERROR] No DataAI launch target found.
pause
exit /b 1