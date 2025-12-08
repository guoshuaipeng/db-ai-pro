#!/bin/bash

# ============================================
# DataAI Mac 打包脚本 (增强版)
# ============================================

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[信息]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[成功]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[警告]${NC} $1"
}

print_error() {
    echo -e "${RED}[错误]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v "$1" &> /dev/null; then
        return 1
    fi
    return 0
}

echo "========================================"
echo "DataAI Mac 打包脚本 (增强版)"
echo "========================================"
echo ""

# 检查操作系统
if [[ "$OSTYPE" != "darwin"* ]]; then
    print_error "此脚本只能在 macOS 上运行"
    exit 1
fi

# 检测系统架构
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
    print_info "检测到 Apple Silicon (ARM64) 架构"
    TARGET_ARCH="arm64"
elif [[ "$ARCH" == "x86_64" ]]; then
    print_info "检测到 Intel (x86_64) 架构"
    TARGET_ARCH="x86_64"
else
    print_warning "未知架构: $ARCH，将使用默认设置"
    TARGET_ARCH="universal"
fi

# 设置 Python 路径（优先使用 Anaconda）
if [ -f "/Users/guoshuaipeng/opt/anaconda3/bin/python" ]; then
    PYTHON="/Users/guoshuaipeng/opt/anaconda3/bin/python"
    PIP="/Users/guoshuaipeng/opt/anaconda3/bin/pip"
    print_info "使用 Anaconda Python: $PYTHON"
elif check_command python3; then
    PYTHON="python3"
    PIP="pip3"
    print_info "使用系统 Python: $PYTHON"
else
    print_error "未找到 Python，请先安装 Python 3.8+"
    exit 1
fi

PYTHON_VERSION=$($PYTHON --version | cut -d' ' -f2 | cut -d'.' -f1,2)
print_info "Python 版本: $($PYTHON --version)"

# 检查并安装 PyInstaller
if ! $PYTHON -c "import PyInstaller" 2>/dev/null; then
    print_warning "未安装 PyInstaller"
    print_info "正在安装 PyInstaller..."
    $PIP install pyinstaller
    if [ $? -ne 0 ]; then
        print_error "PyInstaller 安装失败"
        exit 1
    fi
    print_success "PyInstaller 安装成功"
else
    PYINSTALLER_VERSION=$($PYTHON -c "import PyInstaller; print(PyInstaller.__version__)" 2>/dev/null)
    print_info "PyInstaller 版本: $PYINSTALLER_VERSION"
fi

# 检查代码签名证书（可选）
CODESIGN_IDENTITY=""
if check_command security; then
    # 查找可用的开发者证书
    CERT=$(security find-identity -v -p codesigning 2>/dev/null | grep "Developer ID Application" | head -1 | sed 's/.*"\(.*\)".*/\1/')
    if [ -n "$CERT" ]; then
        print_info "找到代码签名证书: $CERT"
        read -p "是否使用此证书进行代码签名? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            CODESIGN_IDENTITY="$CERT"
        fi
    else
        print_info "未找到代码签名证书，将跳过代码签名"
    fi
fi

# 步骤 1: 清理旧的构建文件
print_info "[1/7] 清理旧的构建文件..."
rm -rf build dist __pycache__ *.app build_mac.spec
find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete 2>/dev/null || true

# 清理可能存在的嵌入配置文件
if [ -f "src/core/embedded_ai_config.py" ]; then
    print_info "清理旧的嵌入配置文件..."
    rm -f src/core/embedded_ai_config.py
fi

# 步骤 2: 检查并安装依赖
print_info "[2/7] 检查依赖..."
MISSING_DEPS=()

$PYTHON -c "import PyQt6" 2>/dev/null || MISSING_DEPS+=("PyQt6")
$PYTHON -c "import sqlalchemy" 2>/dev/null || MISSING_DEPS+=("sqlalchemy")
$PYTHON -c "import pymysql" 2>/dev/null || MISSING_DEPS+=("pymysql")
$PYTHON -c "import psycopg2" 2>/dev/null || MISSING_DEPS+=("psycopg2")
$PYTHON -c "import oracledb" 2>/dev/null || MISSING_DEPS+=("oracledb")
# pyodbc 是可选的，如果失败不影响打包
if ! $PYTHON -c "import pyodbc" 2>/dev/null; then
    print_warning "pyodbc 未安装或缺少系统依赖，将跳过 SQL Server 支持"
    print_info "如需 SQL Server 支持，请安装: brew install unixodbc"
else
    print_info "pyodbc 可用，将包含 SQL Server 支持"
fi
$PYTHON -c "import openai" 2>/dev/null || MISSING_DEPS+=("openai")
$PYTHON -c "import cryptography" 2>/dev/null || MISSING_DEPS+=("cryptography")
$PYTHON -c "import pydantic" 2>/dev/null || MISSING_DEPS+=("pydantic")

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    print_warning "缺少以下依赖: ${MISSING_DEPS[*]}"
    print_info "正在安装依赖..."
    $PIP install -r requirements.txt
    if [ $? -ne 0 ]; then
        print_error "依赖安装失败"
        exit 1
    fi
    print_success "依赖安装完成"
else
    print_success "所有依赖已安装"
fi

# 步骤 3: 检查图标文件
print_info "[3/7] 检查图标文件..."
if [ ! -f "resources/icons/app_icon.png" ]; then
    print_warning "未找到 app_icon.png，尝试生成..."
    if [ -f "resources/icons/create_app_icon.py" ]; then
        $PYTHON resources/icons/create_app_icon.py 2>/dev/null || print_warning "图标生成跳过"
    else
        print_warning "图标生成脚本不存在"
    fi
fi

if [ -f "resources/icons/app_icon.png" ]; then
    print_success "图标文件已就绪"
else
    print_warning "将使用默认图标"
fi

# 步骤 4: 读取版本号
VERSION="0.2.0"
if [ -f "pyproject.toml" ]; then
    VERSION=$(grep -E "^version\s*=" pyproject.toml | head -1 | sed 's/.*"\(.*\)".*/\1/' || echo "0.2.0")
fi
print_info "应用版本: $VERSION"

# 步骤 5: 创建 PyInstaller spec 文件
print_info "[4/7] 创建 PyInstaller spec 文件..."

# 检查 pyodbc（可选，如果失败不影响打包）
PYODBC_IMPORT=""
if $PYTHON -c "import pyodbc" 2>/dev/null; then
    PYODBC_IMPORT="        'pyodbc',"
    print_info "pyodbc 可用，将包含 SQL Server 支持"
else
    print_warning "pyodbc 未安装或缺少系统依赖，将跳过 SQL Server 支持"
    print_info "如需 SQL Server 支持，请安装: brew install unixodbc"
fi

# 构建 codesign 参数
CODESIGN_PARAM=""
if [ -n "$CODESIGN_IDENTITY" ]; then
    CODESIGN_PARAM="codesign_identity='$CODESIGN_IDENTITY',"
fi

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
        'PyQt6.QtSql',
        'sqlalchemy',
        'sqlalchemy.dialects.mysql',
        'sqlalchemy.dialects.postgresql',
        'sqlalchemy.dialects.oracle',
        'sqlalchemy.dialects.mssql',
        'pymysql',
        'psycopg2',
        'psycopg2._psycopg',
        'oracledb',
${PYODBC_IMPORT}
        'openai',
        'cryptography',
        'pydantic',
        'pydantic_settings',
        'dotenv',
        'python-dotenv',
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
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    $CODESIGN_PARAM
    entitlements_file=None,
)

app = BUNDLE(
    exe,
    name='DataAI.app',
    icon='resources/icons/app_icon.png' if os.path.exists('resources/icons/app_icon.png') else None,
    bundle_identifier='com.dataai.app',
    info_plist={
        'NSPrincipalClass': 'NSApplication',
        'NSHighResolutionCapable': 'True',
        'CFBundleShortVersionString': '$VERSION',
        'CFBundleVersion': '$VERSION',
        'NSHumanReadableCopyright': 'Copyright © 2024 DataAI',
        'LSMinimumSystemVersion': '10.13',
        'NSRequiresAquaSystemAppearance': 'False',
        'NSAppleEventsUsageDescription': 'DataAI 需要访问 Apple Events 以提供更好的用户体验',
        'NSCameraUsageDescription': 'DataAI 不会访问您的摄像头',
        'NSMicrophoneUsageDescription': 'DataAI 不会访问您的麦克风',
    },
)
EOF

print_success "Spec 文件已创建"

# 步骤 6: 开始打包
print_info "[5/7] 开始打包为 Mac .app..."
print_info "这可能需要几分钟时间，请耐心等待..."

$PYTHON -m PyInstaller build_mac.spec --clean --noconfirm

if [ $? -ne 0 ]; then
    print_error "打包失败"
    exit 1
fi

# 步骤 7: 处理打包结果
print_info "[6/7] 处理打包结果..."

if [ -d "dist/DataAI.app" ]; then
    print_success ".app 包已生成: dist/DataAI.app"
    
    # 设置可执行权限
    chmod +x "dist/DataAI.app/Contents/MacOS/DataAI"
    
    # 代码签名（如果提供了证书）
    if [ -n "$CODESIGN_IDENTITY" ]; then
        print_info "正在进行代码签名..."
        codesign --force --deep --sign "$CODESIGN_IDENTITY" "dist/DataAI.app"
        if [ $? -eq 0 ]; then
            print_success "代码签名成功"
            
            # 验证签名
            print_info "验证代码签名..."
            codesign --verify --verbose "dist/DataAI.app"
            if [ $? -eq 0 ]; then
                print_success "代码签名验证通过"
            else
                print_warning "代码签名验证失败"
            fi
        else
            print_warning "代码签名失败，但 .app 包已成功生成"
        fi
    fi
    
    # 获取应用大小
    APP_SIZE=$(du -sh "dist/DataAI.app" | cut -f1)
    print_info "应用大小: $APP_SIZE"
    
    # 步骤 8: 创建 DMG 文件（可选）
    print_info "[7/7] 准备创建 DMG 安装包..."
    read -p "是否创建 DMG 安装包? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "正在创建 DMG 文件..."
        
        DMG_NAME="DataAI-Community-v${VERSION}-$(date +%Y%m%d).dmg"
        DMG_PATH="dist/$DMG_NAME"
        
        # 创建临时目录用于 DMG
        TEMP_DMG_DIR="dist/dmg_temp"
        rm -rf "$TEMP_DMG_DIR"
        mkdir -p "$TEMP_DMG_DIR"
        
        # 复制 .app 到临时目录
        cp -R "dist/DataAI.app" "$TEMP_DMG_DIR/"
        
        # 创建 Applications 链接
        ln -s /Applications "$TEMP_DMG_DIR/Applications"
        
        # 创建 README 文件（可选）
        cat > "$TEMP_DMG_DIR/README.txt" << README_EOF
DataAI Community Edition

安装说明：
1. 将 DataAI.app 拖拽到 Applications 文件夹
2. 双击运行应用程序

系统要求：
- macOS 10.13 或更高版本
- 支持 Intel 和 Apple Silicon 架构

版本: $VERSION
构建日期: $(date +"%Y-%m-%d %H:%M:%S")
README_EOF
        
        # 创建 DMG
        hdiutil create -volname "DataAI" -srcfolder "$TEMP_DMG_DIR" -ov -format UDZO "$DMG_PATH"
        
        if [ $? -eq 0 ]; then
            print_success "DMG 文件已创建: $DMG_PATH"
            
            # 获取 DMG 大小
            DMG_SIZE=$(du -sh "$DMG_PATH" | cut -f1)
            print_info "DMG 大小: $DMG_SIZE"
            
            # 清理临时目录
            rm -rf "$TEMP_DMG_DIR"
            
            # 如果已签名，也签名 DMG
            if [ -n "$CODESIGN_IDENTITY" ]; then
                print_info "正在签名 DMG 文件..."
                codesign --sign "$CODESIGN_IDENTITY" "$DMG_PATH" 2>/dev/null || print_warning "DMG 签名失败（可选）"
            fi
        else
            print_warning "DMG 创建失败，但 .app 包已成功生成"
            rm -rf "$TEMP_DMG_DIR"
        fi
    fi
else
    print_error "未找到生成的 .app 包"
    exit 1
fi

# 完成
echo ""
echo "========================================"
print_success "打包完成！"
echo "========================================"
echo ""
echo "应用程序位置: $(pwd)/dist/DataAI.app"
if [ -f "dist/$DMG_NAME" ]; then
    echo "DMG 安装包: $(pwd)/dist/$DMG_NAME"
fi
echo ""
echo "提示："
echo "- 可以直接双击 .app 文件运行"
echo "- 如果遇到安全提示，请在系统偏好设置 > 安全性与隐私中允许运行"
echo "- 首次运行可能需要几秒钟加载"
echo "- 如需分发，建议创建 DMG 安装包"
if [ -z "$CODESIGN_IDENTITY" ]; then
    echo "- 未进行代码签名，用户可能需要右键点击并选择'打开'来绕过 Gatekeeper"
fi
echo ""



