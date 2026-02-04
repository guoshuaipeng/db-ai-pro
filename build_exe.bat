@echo off
chcp 65001 >nul
echo ========================================
echo DataAI Build Script
echo ========================================
echo.

REM Check PyInstaller
python -c "import PyInstaller" 2>nul
if errorlevel 1 (
    echo [ERROR] PyInstaller not found. Installing...
    pip install pyinstaller
    if errorlevel 1 (
        echo [ERROR] PyInstaller install failed
        pause
        exit /b 1
    )
)

echo [1/4] Cleaning old build...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist __pycache__ rmdir /s /q __pycache__
for /d /r . %%d in (__pycache__) do @if exist "%%d" rmdir /s /q "%%d"
if exist src\core\embedded_ai_config.py (
    echo [INFO] Removing old embedded config...
    del /q src\core\embedded_ai_config.py
)

echo [2/4] Checking dependencies...
python -c "import PyQt6; import sqlalchemy; import pymysql; import psycopg2; import oracledb; import pyodbc; import openai; import cryptography; import pydantic; print('OK')" 2>nul
if errorlevel 1 (
    echo [WARN] Some deps may be missing. Installing from requirements.txt...
    pip install -r requirements.txt
)

echo [3/4] Generating ICO icon...
python resources\icons\create_ico.py
if errorlevel 1 (
    echo [WARN] ICO failed, will use PNG icon
)

echo [4/5] Generating build version...
for /f "tokens=2 delims==" %%a in ('python scripts\generate_build_version.py 2^>nul ^| findstr /C:"BUILD_VERSION="') do set BUILD_VERSION=%%a
if errorlevel 1 (
    echo [WARN] Version script failed, using default
) else (
    if defined BUILD_VERSION (
        echo [INFO] Version: %BUILD_VERSION%
        set "BUILD_VERSION=%BUILD_VERSION%"
    ) else (
        echo [INFO] No version set, using default
    )
)

echo [5/5] Building (no default AI config)...
if defined BUILD_VERSION (
    set "BUILD_VERSION=%BUILD_VERSION%"
)
pyinstaller build_exe.spec --clean --noconfirm

if errorlevel 1 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)

if exist VERSION.txt (
    copy /Y VERSION.txt dist\VERSION.txt >nul
    echo [INFO] Copied VERSION.txt to dist\
)

echo Build done.
echo.
echo ========================================
echo Output: dist\DataAI.exe
if defined BUILD_VERSION (
    echo Version: %BUILD_VERSION%
    echo Version file: dist\VERSION.txt
)
echo ========================================
echo.
echo Note: First run may take a few seconds. If you see missing DLL errors, install Visual C++ Redistributable.
echo.
pause
