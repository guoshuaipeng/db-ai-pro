#!/bin/bash

echo "========================================"
echo "DataAI 打包脚本"
echo "========================================"
echo ""

# 检查是否安装了 PyInstaller
if ! python3 -c "import PyInstaller" 2>/dev/null; then
    echo "[错误] 未安装 PyInstaller"
    echo "正在安装 PyInstaller..."
    pip3 install pyinstaller
    if [ $? -ne 0 ]; then
        echo "[错误] PyInstaller 安装失败"
        exit 1
    fi
fi

echo "[1/4] 清理旧的构建文件..."
rm -rf build dist __pycache__
find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null
# 清理可能存在的嵌入配置文件（确保不包含旧配置）
if [ -f "src/core/embedded_ai_config.py" ]; then
    echo "[提示] 清理旧的嵌入配置文件..."
    rm -f src/core/embedded_ai_config.py
fi

echo "[2/4] 检查依赖..."
python3 -c "import PyQt6; import sqlalchemy; import pymysql; import psycopg2; import oracledb; import pyodbc; import openai; import cryptography; import pydantic; print('所有依赖已安装')" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "[警告] 部分依赖可能未安装，请确保已安装 requirements.txt 中的所有包"
    echo "正在安装依赖..."
    pip3 install -r requirements.txt
fi

echo "[3/4] 生成ICO图标文件（如果需要）..."
python3 resources/icons/create_ico.py 2>/dev/null || echo "[提示] ICO生成跳过（Linux/Mac可选）"

echo "[4/4] 开始打包（不包含默认AI配置）..."
pyinstaller build_exe.spec --clean --noconfirm

if [ $? -ne 0 ]; then
    echo "[错误] 打包失败"
    exit 1
fi

# 重命名为社区版
if [ -f "dist/DataAI" ]; then
    echo "[提示] 重命名为社区版..."
    mv dist/DataAI dist/DataAI-Community 2>/dev/null
    if [ -f "dist/DataAI" ]; then
        echo "[警告] 重命名失败，文件仍为 DataAI"
    fi
fi

echo "打包完成！"
echo ""
echo "========================================"
echo "可执行文件位置: dist/DataAI-Community"
echo "========================================"
echo ""
echo "提示："
echo "- 首次运行可能需要几秒钟加载"
echo "- 如果遇到权限问题，请运行: chmod +x dist/DataAI-Community"
echo ""

