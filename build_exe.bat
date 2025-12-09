@echo off
chcp 65001 >nul
echo ========================================
echo DataAI 打包脚本
echo ========================================
echo.

REM 检查是否安装了 PyInstaller
python -c "import PyInstaller" 2>nul
if errorlevel 1 (
    echo [错误] 未安装 PyInstaller
    echo 正在安装 PyInstaller...
    pip install pyinstaller
    if errorlevel 1 (
        echo [错误] PyInstaller 安装失败
        pause
        exit /b 1
    )
)

echo [1/4] 清理旧的构建文件...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist __pycache__ rmdir /s /q __pycache__
for /d /r . %%d in (__pycache__) do @if exist "%%d" rmdir /s /q "%%d"
REM 清理可能存在的嵌入配置文件（确保不包含旧配置）
if exist src\core\embedded_ai_config.py (
    echo [提示] 清理旧的嵌入配置文件...
    del /q src\core\embedded_ai_config.py
)

echo [2/4] 检查依赖...
python -c "import PyQt6; import sqlalchemy; import pymysql; import psycopg2; import oracledb; import pyodbc; import openai; import cryptography; import pydantic; print('所有依赖已安装')" 2>nul
if errorlevel 1 (
    echo [警告] 部分依赖可能未安装，请确保已安装 requirements.txt 中的所有包
    echo 正在安装依赖...
    pip install -r requirements.txt
)

echo [3/4] 生成ICO图标文件（用于Windows任务栏）...
python resources\icons\create_ico.py
if errorlevel 1 (
    echo [警告] ICO文件生成失败，将使用PNG图标
)

echo [4/4] 开始打包（不包含默认AI配置）...
pyinstaller build_exe.spec --clean --noconfirm

if errorlevel 1 (
    echo [错误] 打包失败
    pause
    exit /b 1
)

echo 打包完成！
echo.
echo ========================================
echo 可执行文件位置: dist\DataAI.exe
echo ========================================
echo.
echo 提示：
echo - 首次运行可能需要几秒钟加载
echo - 如果遇到缺少 DLL 的错误，请安装 Visual C++ Redistributable
echo.
pause

