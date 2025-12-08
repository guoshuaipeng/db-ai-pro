# 国际化（i18n）功能使用指南

## 功能概述

DataAI 现在支持多语言界面，可以在设置中切换语言。目前支持：
- 中文（zh_CN）- 默认语言
- 英文（en_US）

## 使用方法

### 切换语言

1. 打开应用程序
2. 点击菜单栏：**设置** → **设置**
3. 在设置对话框中，选择 **界面语言**
4. 从下拉菜单中选择所需语言（中文 或 English）
5. 点击 **确定**
6. 界面会立即更新为新语言（无需重启）

## 技术实现

### 文件结构

```
resources/translations/
  ├── dataai_en_US.ts    # 英文翻译源文件（XML格式）
  ├── dataai_en_US.qm    # 编译后的英文翻译文件（二进制格式）
  └── README.md          # 翻译文件说明

scripts/
  └── generate_translations.py  # 生成翻译文件的脚本

src/core/
  └── i18n.py            # 翻译管理器

src/gui/dialogs/
  └── settings_dialog.py # 设置对话框（包含语言选择）
```

### 添加新语言

1. 复制 `dataai_en_US.ts` 并重命名为 `dataai_<语言代码>.ts`
2. 编辑翻译文件，将所有 `<translation>` 标签中的英文替换为新语言
3. 运行 `python scripts/generate_translations.py` 生成 `.qm` 文件
4. 在 `src/core/i18n.py` 的 `get_available_languages()` 方法中添加新语言

### 添加新翻译文本

1. 在代码中使用 `self.tr("中文文本")` 包装需要翻译的文本
2. 运行 `pylupdate6` 工具更新 `.ts` 文件（如果可用）
3. 或者手动在 `.ts` 文件中添加新的翻译条目
4. 重新编译生成 `.qm` 文件

## 注意事项

- 中文是默认语言，不需要翻译文件
- 英文翻译需要编译后的 `.qm` 文件才能使用
- 如果 `.qm` 文件不存在，应用程序会回退到中文
- 语言切换是实时的，大部分界面元素会立即更新
- 某些动态生成的文本可能需要刷新才能看到翻译

## 生成翻译文件

### 方法1: 使用脚本（推荐）

```bash
python scripts/generate_translations.py
```

### 方法2: 手动使用 lrelease

```bash
lrelease resources/translations/dataai_en_US.ts -qm resources/translations/dataai_en_US.qm
```

### 安装 lrelease 工具

- **Windows**: 安装 Qt6 工具链或使用 PyQt6 自带的工具
- **Linux**: `sudo apt-get install qttools6-dev-tools`
- **macOS**: `brew install qt6`

详细说明请参考 `resources/translations/README.md`

