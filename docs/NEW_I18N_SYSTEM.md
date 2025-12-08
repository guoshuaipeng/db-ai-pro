# 新的翻译系统（无需 .qm 文件）

## 概述

现在项目使用了一个新的翻译系统，**完全不需要 lrelease 工具和 .qm 文件**！

## 工作原理

1. **翻译文件格式**：
   - 使用 JSON 格式存储翻译（`dataai_en_US.json`）
   - 或直接使用 TS 文件（`dataai_en_US.ts`）

2. **翻译加载**：
   - 系统会自动加载 JSON 文件（如果存在）
   - 如果 JSON 不存在，会加载 TS 文件
   - 完全不需要编译 .qm 文件

3. **翻译应用**：
   - 重写了 `MainWindow` 和 `SettingsDialog` 的 `tr()` 方法
   - 自动使用简单翻译系统进行翻译
   - 如果 PyQt6 的翻译系统有翻译，优先使用；否则使用我们的翻译系统

## 文件说明

- `resources/translations/dataai_en_US.ts` - TS 源文件（XML 格式）
- `resources/translations/dataai_en_US.json` - JSON 翻译文件（已生成）
- `src/core/simple_i18n.py` - 简单翻译系统核心代码
- `src/core/i18n.py` - 翻译管理器（已更新，支持 JSON/TS）

## 使用方法

### 1. 生成 JSON 文件（如果需要）

```bash
python scripts/convert_ts_to_json.py
```

### 2. 使用翻译

代码中正常使用 `self.tr()` 即可：

```python
self.setWindowTitle(self.tr("DataAI - AI驱动的数据库管理工具"))
```

系统会自动：
- 如果是中文，返回原文本
- 如果是英文，从 JSON/TS 文件中查找翻译

### 3. 添加新翻译

1. 编辑 `dataai_en_US.ts` 文件，添加新的翻译条目
2. 运行 `python scripts/convert_ts_to_json.py` 重新生成 JSON
3. 重启应用即可

## 优势

✅ **无需安装 Qt6 工具链**
✅ **无需 lrelease 工具**
✅ **无需 .qm 文件**
✅ **使用简单的 JSON 格式**
✅ **完全兼容现有代码**

## 测试

运行测试脚本验证翻译系统：

```bash
python scripts/test_translation.py
```

应该看到：
- ✓ 使用 JSON 翻译文件
- ✓ 翻译系统已就绪，无需 .qm 文件

## 技术细节

- 翻译系统在 `TranslationManager.load_translation()` 中自动加载
- 如果找到 JSON 文件，优先使用 JSON
- 如果 JSON 不存在，使用 TS 文件
- `MainWindow` 和 `SettingsDialog` 重写了 `tr()` 方法
- 翻译查找顺序：PyQt6 翻译 → 简单翻译系统 → 原文本

