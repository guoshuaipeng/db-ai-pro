#!/bin/bash

echo "========================================"
echo "DataAI 打包脚本（内置默认AI配置）"
echo "========================================"
echo ""
echo "[提示] 此脚本会将默认AI模型配置编译到exe中"
echo "[提示] 请确保已设置以下环境变量："
echo "  DATAAI_DEFAULT_AI_API_KEY - API密钥（必需）"
echo "  DATAAI_DEFAULT_AI_NAME - 配置名称（可选）"
echo "  DATAAI_DEFAULT_AI_PROVIDER - 提供商（可选）"
echo "  DATAAI_DEFAULT_AI_BASE_URL - 基础URL（可选）"
echo "  DATAAI_DEFAULT_AI_DEFAULT_MODEL - 默认模型（可选）"
echo "  DATAAI_DEFAULT_AI_TURBO_MODEL - Turbo模型（可选）"
echo ""

# 检查是否设置了API密钥
if [ -z "$DATAAI_DEFAULT_AI_API_KEY" ]; then
    echo "[错误] 未设置 DATAAI_DEFAULT_AI_API_KEY 环境变量"
    echo "[提示] 请先设置环境变量，例如："
    echo "  export DATAAI_DEFAULT_AI_API_KEY=your-api-key-here"
    echo "  export DATAAI_DEFAULT_AI_NAME=默认配置"
    echo "  export DATAAI_DEFAULT_AI_PROVIDER=aliyun_qianwen"
    echo ""
    exit 1
fi

echo "[提示] 检测到默认AI配置环境变量"
if [ -n "$DATAAI_DEFAULT_AI_NAME" ]; then
    echo "[提示] 配置名称: $DATAAI_DEFAULT_AI_NAME"
fi
if [ -n "$DATAAI_DEFAULT_AI_PROVIDER" ]; then
    echo "[提示] 提供商: $DATAAI_DEFAULT_AI_PROVIDER"
fi
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

echo "[1/5] 清理旧的构建文件..."
rm -rf build dist __pycache__
find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null

echo "[2/5] 检查依赖..."
python3 -c "import PyQt6; import sqlalchemy; import pymysql; import psycopg2; import oracledb; import pyodbc; import openai; import cryptography; import pydantic; print('所有依赖已安装')" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "[警告] 部分依赖可能未安装，请确保已安装 requirements.txt 中的所有包"
    echo "正在安装依赖..."
    pip3 install -r requirements.txt
fi

echo "[3/5] 生成ICO图标文件（如果需要）..."
python3 resources/icons/create_ico.py 2>/dev/null || echo "[提示] ICO生成跳过（Linux/Mac可选）"

echo "[4/5] 生成嵌入的AI配置..."
python3 scripts/generate_embedded_config.py
if [ $? -ne 0 ]; then
    echo "[错误] 生成嵌入配置失败"
    exit 1
fi

echo "[5/5] 开始打包（包含默认AI配置）..."
pyinstaller build_exe.spec --clean --noconfirm

if [ $? -ne 0 ]; then
    echo "[错误] 打包失败"
    exit 1
fi

# 重命名为专业版
if [ -f "dist/DataAI" ]; then
    echo "[提示] 重命名为专业版..."
    mv dist/DataAI dist/DataAI-Pro 2>/dev/null
    if [ -f "dist/DataAI" ]; then
        echo "[警告] 重命名失败，文件仍为 DataAI"
    fi
fi

echo ""
echo "========================================"
echo "打包完成！"
echo "========================================"
echo ""
echo "可执行文件位置: dist/DataAI-Pro"
echo ""
echo "[重要提示]"
echo "- 此exe包含默认AI配置，请妥善保管"
echo "- 不要将包含真实API密钥的exe分享给不信任的用户"
echo "- 首次运行可能需要几秒钟加载"
echo "- 如果遇到权限问题，请运行: chmod +x dist/DataAI-Pro"
echo ""


