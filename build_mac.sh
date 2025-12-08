#!/bin/bash

echo "========================================"
echo "DataAI Mac 打包脚本"
echo "========================================"
echo ""

# 检查操作系统
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "[错误] 此脚本只能在 macOS 上运行"
    exit 1
fi

# 设置 Python 路径（优先使用 Anaconda）
if [ -f "/Users/guoshuaipeng/opt/anaconda3/bin/python" ]; then
    PYTHON="/Users/guoshuaipeng/opt/anaconda3/bin/python"
    PIP="/Users/guoshuaipeng/opt/anaconda3/bin/pip"
    echo "[信息] 使用 Anaconda Python: $PYTHON"
elif command -v python3 &> /dev/null; then
    PYTHON="python3"
    PIP="pip3"
    echo "[信息] 使用系统 Python: $PYTHON"
else
    echo "[错误] 未找到 Python"
    exit 1
fi

# 检查是否安装了 PyInstaller
if ! $PYTHON -c "import PyInstaller" 2>/dev/null; then
    echo "[错误] 未安装 PyInstaller"
    echo "正在安装 PyInstaller..."
    $PIP install pyinstaller
    if [ $? -ne 0 ]; then
        echo "[错误] PyInstaller 安装失败"
        exit 1
    fi
fi

echo "[1/6] 清理旧的构建文件..."
rm -rf build dist __pycache__ *.app
find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null
# 清理可能存在的嵌入配置文件（确保不包含旧配置）
if [ -f "src/core/embedded_ai_config.py" ]; then
    echo "[提示] 清理旧的嵌入配置文件..."
    rm -f src/core/embedded_ai_config.py
fi

echo "[2/6] 检查依赖..."
$PYTHON -c "import PyQt6; import sqlalchemy; import pymysql; import psycopg2; import oracledb; import openai; import cryptography; import pydantic; print('核心依赖已安装')" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "[警告] 部分依赖可能未安装，请确保已安装 requirements.txt 中的所有包"
    echo "正在安装依赖..."
    $PIP install -r requirements.txt
fi

# 检查 pyodbc（可选，如果失败不影响打包）
PYODBC_IMPORT=""
if $PYTHON -c "import pyodbc" 2>/dev/null; then
    PYODBC_IMPORT="'pyodbc',"
    echo "[信息] pyodbc 可用，将包含 SQL Server 支持"
else
    echo "[警告] pyodbc 未安装或缺少系统依赖，将跳过 SQL Server 支持"
    echo "[提示] 如需 SQL Server 支持，请安装: brew install unixodbc"
fi

echo "[3/6] 检查图标文件..."
if [ ! -f "resources/icons/app_icon.png" ]; then
    echo "[警告] 未找到 app_icon.png，尝试生成..."
    $PYTHON resources/icons/create_app_icon.py 2>/dev/null || echo "[提示] 图标生成跳过"
fi

echo "[4/6] 创建 PyInstaller spec 文件..."
# 动态生成 spec 文件
cat > build_mac.spec << EOF
# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['src/main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('resources/icons', 'resources/icons'),
        ('resources/images', 'resources/images'),
        ('resources/styles', 'resources/styles'),
        ('resources/translations', 'resources/translations'),
    ],
    hiddenimports=[
        'PyQt6.QtCore',
        'PyQt6.QtGui',
        'PyQt6.QtWidgets',
        'sqlalchemy',
        'pymysql',
        'psycopg2',
        'oracledb',
${PYODBC_IMPORT}        'openai',
        'cryptography',
        'pydantic',
        'pydantic_settings',
        'dotenv',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='DataAI',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # 不显示控制台窗口
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

app = BUNDLE(
    exe,
    name='DataAI.app',
    icon='resources/icons/app_icon.png',
    bundle_identifier='com.dataai.app',
    info_plist={
        'NSPrincipalClass': 'NSApplication',
        'NSHighResolutionCapable': 'True',
        'CFBundleShortVersionString': '0.2.0',
        'CFBundleVersion': '0.2.0',
        'NSHumanReadableCopyright': 'Copyright © 2024 DataAI',
        'LSMinimumSystemVersion': '10.13',
        'NSRequiresAquaSystemAppearance': 'False',
    },
)
EOF

echo "[5/6] 开始打包为 Mac .app..."
$PYTHON -m PyInstaller build_mac.spec --clean --noconfirm

if [ $? -ne 0 ]; then
    echo "[错误] 打包失败"
    exit 1
fi

echo "[6/6] 处理打包结果..."

# 检查 .app 是否生成
if [ -d "dist/DataAI.app" ]; then
    echo "[成功] .app 包已生成: dist/DataAI.app"
    
    # 设置可执行权限
    chmod +x "dist/DataAI.app/Contents/MacOS/DataAI"
    
    # 可选：创建 DMG 文件
    read -p "是否创建 DMG 安装包? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "[提示] 正在创建 DMG 文件..."
        
        DMG_NAME="DataAI-Community-$(date +%Y%m%d).dmg"
        DMG_PATH="dist/$DMG_NAME"
        
        # 创建临时目录用于 DMG
        TEMP_DMG_DIR="dist/dmg_temp"
        rm -rf "$TEMP_DMG_DIR"
        mkdir -p "$TEMP_DMG_DIR"
        
        # 复制 .app 到临时目录
        cp -R "dist/DataAI.app" "$TEMP_DMG_DIR/"
        
        # 创建 Applications 链接（可选）
        ln -s /Applications "$TEMP_DMG_DIR/Applications"
        
        # 创建 DMG
        hdiutil create -volname "DataAI" -srcfolder "$TEMP_DMG_DIR" -ov -format UDZO "$DMG_PATH"
        
        if [ $? -eq 0 ]; then
            echo "[成功] DMG 文件已创建: $DMG_PATH"
            rm -rf "$TEMP_DMG_DIR"
        else
            echo "[警告] DMG 创建失败，但 .app 包已成功生成"
        fi
    fi
else
    echo "[错误] 未找到生成的 .app 包"
    exit 1
fi

echo ""
echo "========================================"
echo "打包完成！"
echo "========================================"
echo ""
echo "应用程序位置: dist/DataAI.app"
if [ -f "dist/$DMG_NAME" ]; then
    echo "DMG 安装包: dist/$DMG_NAME"
fi
echo ""
echo "提示："
echo "- 可以直接双击 .app 文件运行"
echo "- 如果遇到安全提示，请在系统偏好设置 > 安全性与隐私中允许运行"
echo "- 首次运行可能需要几秒钟加载"
echo "- 如需分发，建议创建 DMG 安装包"
echo ""

