# 翻译文件说明

## 文件说明

- `dataai_en_US.ts` - 英文翻译源文件（XML格式）
- `dataai_en_US.qm` - 编译后的英文翻译文件（二进制格式，由 lrelease 生成）

## 生成翻译文件

### 方法1: 使用脚本（推荐）

运行项目根目录下的脚本：

```bash
python scripts/generate_translations.py
```

### 方法2: 手动使用 lrelease

如果脚本找不到 lrelease 工具，可以手动编译：

```bash
lrelease resources/translations/dataai_en_US.ts -qm resources/translations/dataai_en_US.qm
```

### 安装 lrelease 工具

#### Windows

1. 安装 Qt6 工具链：
   - 下载 Qt6 安装程序：https://www.qt.io/download
   - 或者使用 pip 安装 PyQt6-Tools（如果可用）

2. 或者使用 PyQt6 自带的工具：
   - 通常位于 Python 安装目录下的 `Lib/site-packages/PyQt6/Qt6/bin/lrelease.exe`

#### Linux

```bash
# Ubuntu/Debian
sudo apt-get install qttools6-dev-tools

# 或者
sudo apt-get install qt6-l10n-tools
```

#### macOS

```bash
brew install qt6
```

## 添加新翻译

1. 编辑 `dataai_en_US.ts` 文件，添加新的翻译条目
2. 运行生成脚本重新编译
3. 重启应用程序以加载新翻译

## 翻译文件格式

`.ts` 文件是 XML 格式的翻译源文件，包含：
- `<context>` - 上下文（通常是类名）
- `<message>` - 翻译条目
  - `<source>` - 源文本（中文）
  - `<translation>` - 翻译文本（英文）

## 注意事项

- 中文是默认语言，不需要翻译文件
- 英文翻译需要编译后的 `.qm` 文件才能使用
- 如果 `.qm` 文件不存在，应用程序会回退到中文

