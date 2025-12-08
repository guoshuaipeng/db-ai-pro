@echo off
chcp 65001 >nul
echo ========================================
echo DataAI 打包脚本（内置默认AI配置）
echo ========================================
echo.
echo [提示] 此脚本会将默认AI模型配置编译到exe中
echo [提示] 请确保已设置以下环境变量：
echo   DATAAI_DEFAULT_AI_API_KEY - API密钥（必需）
echo   DATAAI_DEFAULT_AI_NAME - 配置名称（可选）
echo   DATAAI_DEFAULT_AI_PROVIDER - 提供商（可选）
echo   DATAAI_DEFAULT_AI_BASE_URL - 基础URL（可选）
echo   DATAAI_DEFAULT_AI_DEFAULT_MODEL - 默认模型（可选）
echo   DATAAI_DEFAULT_AI_TURBO_MODEL - Turbo模型（可选）
echo.

REM 检查是否设置了API密钥
if not defined DATAAI_DEFAULT_AI_API_KEY (
    echo [错误] 未设置 DATAAI_DEFAULT_AI_API_KEY 环境变量
    echo [提示] 请先设置环境变量，例如：
    echo   set DATAAI_DEFAULT_AI_API_KEY=your-api-key-here
    echo   set DATAAI_DEFAULT_AI_NAME=默认配置
    echo   set DATAAI_DEFAULT_AI_PROVIDER=aliyun_qianwen
    echo.
    pause
    exit /b 1
)

echo [提示] 检测到默认AI配置环境变量
if defined DATAAI_DEFAULT_AI_NAME (
    echo [提示] 配置名称: %DATAAI_DEFAULT_AI_NAME%
)
if defined DATAAI_DEFAULT_AI_PROVIDER (
    echo [提示] 提供商: %DATAAI_DEFAULT_AI_PROVIDER%
)
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

echo [1/5] 清理旧的构建文件...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist __pycache__ rmdir /s /q __pycache__
for /d /r . %%d in (__pycache__) do @if exist "%%d" rmdir /s /q "%%d"

echo [2/5] 检查依赖...
python -c "import PyQt6; import sqlalchemy; import pymysql; import psycopg2; import oracledb; import pyodbc; import openai; import cryptography; import pydantic; print('所有依赖已安装')" 2>nul
if errorlevel 1 (
    echo [警告] 部分依赖可能未安装，请确保已安装 requirements.txt 中的所有包
    echo 正在安装依赖...
    pip install -r requirements.txt
)

echo [3/5] 生成ICO图标文件（用于Windows任务栏）...
python resources\icons\create_ico.py
if errorlevel 1 (
    echo [警告] ICO文件生成失败，将使用PNG图标
)

echo [4/5] 生成嵌入的AI配置...
python scripts\generate_embedded_config.py
if errorlevel 1 (
    echo [错误] 生成嵌入配置失败
    pause
    exit /b 1
)

echo [5/5] 开始打包（包含默认AI配置）...
pyinstaller build_exe.spec --clean --noconfirm

if errorlevel 1 (
    echo [错误] 打包失败
    pause
    exit /b 1
)

REM 重命名为专业版
if exist dist\DataAI.exe (
    echo [提示] 重命名为专业版...
    move /y dist\DataAI.exe dist\DataAI-Pro.exe >nul
    if exist dist\DataAI.exe (
        echo [警告] 重命名失败，文件仍为 DataAI.exe
    )
)

echo.
echo ========================================
echo 打包完成！
echo ========================================
echo.
echo 可执行文件位置: dist\DataAI-Pro.exe
echo.
echo [重要提示]
echo - 此exe包含默认AI配置，请妥善保管
echo - 不要将包含真实API密钥的exe分享给不信任的用户
echo - 首次运行可能需要几秒钟加载
echo - 如果遇到缺少 DLL 的错误，请安装 Visual C++ Redistributable
echo.
pause


