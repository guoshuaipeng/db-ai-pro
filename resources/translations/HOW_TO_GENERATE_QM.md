# 如何生成 .qm 翻译文件

## 问题说明

应用程序需要 `.qm` 文件才能正确显示翻译。如果只有 `.ts` 文件，翻译可能无法正常工作。

## 方法1: 使用 Qt6 官方工具（推荐）

### Windows

1. **下载并安装 Qt6**
   - 访问：https://www.qt.io/download
   - 下载 Qt6 安装程序
   - 安装时选择 "Qt 6.x.x" 和 "Qt 6.x.x Tools" 组件

2. **使用 lrelease**
   ```bash
   lrelease resources/translations/dataai_en_US.ts -qm resources/translations/dataai_en_US.qm
   ```

### 使用在线工具

1. **Qt Linguist 在线工具**
   - 访问：https://www.qt.io/product/development-tools
   - 下载 Qt Linguist（包含 lrelease）

2. **或者使用在线 TS 到 QM 转换器**
   - 搜索 "ts to qm converter online"

## 方法2: 使用预编译的 .qm 文件

如果您无法安装 Qt6 工具，可以：

1. 从项目仓库下载预编译的 `.qm` 文件
2. 或者请其他开发者帮忙生成

## 方法3: 临时解决方案

目前代码已经包含了备用翻译系统（简单翻译器），可以解析 `.ts` 文件。但 PyQt6 的 `tr()` 函数需要 `.qm` 文件才能完全工作。

## 验证

生成 `.qm` 文件后，运行测试脚本验证：

```bash
python scripts/test_translation.py
```

如果看到 "已加载翻译文件" 而不是 "使用简单翻译器"，说明 `.qm` 文件已正确生成。

