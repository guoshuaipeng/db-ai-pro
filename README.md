# DataAI - AI驱动的数据库管理工具

第一款全功能且支持AI的数据库管理工具，让数据库操作更智能、更高效。
下载地址 https://gitee.com/CodeYG/db-ai-pro/releases/tag/v1.1.0

**作者**: codeyG (550187704@qq.com)

> 📖 **English**: See [README_en.md](README_en.md) for English documentation.

## 功能特性

- ✅ **多数据库支持**
  - MySQL / MariaDB
  - PostgreSQL
  - SQLite
  - Oracle
  - SQL Server

- ✅ **数据库连接管理**
  - 添加/编辑/删除数据库连接
  - 连接测试
  - 连接列表管理
  - **从 Navicat 导入连接** 🆕

- ✅ **SQL 查询功能**
  - SQL 编辑器（支持语法高亮）
  - 执行查询（SELECT）
  - 执行非查询语句（INSERT/UPDATE/DELETE）
  - 查询结果表格展示
  - 结果导出（CSV）

- ✅ **AI 智能 SQL 生成** 🤖
  - 自然语言描述生成 SQL 查询
  - AI 辅助创建表
  - AI 辅助编辑表结构
  - 数据库类型感知的 SQL 生成（适配不同数据库类型）

- ✅ **用户界面**
  - 现代化的 PyQt6 界面
  - 分割面板布局
  - 连接树形视图
  - 结果表格展示
  - **多语言支持**（中文/英文）🌐

## 项目结构

```
gui-app/
├── src/
│   ├── main.py                    # 程序入口
│   ├── core/                      # 核心业务逻辑
│   │   ├── database_connection.py # 数据库连接模型
│   │   ├── database_manager.py   # 数据库管理器
│   │   ├── ai_client.py          # AI客户端（SQL生成）
│   │   └── i18n.py               # 国际化
│   ├── gui/                       # GUI组件
│   │   ├── main_window.py        # 主窗口
│   │   ├── dialogs/              # 对话框
│   │   │   ├── connection_dialog.py  # 连接配置对话框
│   │   │   ├── import_dialog.py      # 导入连接对话框 🆕
│   │   │   └── settings_dialog.py   # 设置对话框
│   │   └── widgets/              # 自定义组件
│   │       ├── sql_editor.py     # SQL编辑器
│   │       └── result_table.py   # 结果表格
│   ├── config/                    # 配置管理
│   │   └── settings.py
│   └── utils/                     # 工具函数
│       ├── helpers.py
│       ├── navicat_importer.py   # Navicat导入器 🆕
│       └── registry_helper.py   # Windows注册表助手
├── tests/                         # 测试代码
├── resources/                     # 资源文件
│   └── translations/             # 翻译文件
└── requirements.txt              # 依赖列表
```

## 安装

1. 创建虚拟环境（推荐）:
```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate  # Windows
```

2. 安装依赖:
```bash
pip install -r requirements.txt
```

**注意**: 根据您使用的数据库类型，可能需要安装对应的驱动：
- MySQL: `pymysql` (已包含)
- PostgreSQL: `psycopg2-binary` (已包含)
- Oracle: `cx-Oracle` (可选)
- SQL Server: `pyodbc` (已包含)

## 运行

```bash
python src/main.py
```

## 使用说明

### 1. 添加数据库连接

**方式一：手动添加**
1. 点击菜单 "文件" -> "添加数据库连接" 或工具栏的 "添加连接" 按钮
2. 填写连接信息：
   - 连接名称（自定义）
   - 数据库类型
   - 主机地址
   - 端口
   - 数据库名
   - 用户名
   - 密码
3. 点击 "确定" 保存连接

**方式二：从 Navicat 导入** 🆕
1. 点击菜单 "文件" -> "从 Navicat 导入" 或工具栏的 "导入 Navicat" 按钮
2. 在导入对话框中：
   - 点击 "自动检测 Navicat 连接" 自动从注册表或配置文件导入（Windows）
   - 或点击 "从 .ncx 文件导入" 选择 Navicat 导出的 `.ncx` 文件
3. 选择要导入的连接（支持多选）
4. 点击 "确定" 导入选中的连接

**如何从 Navicat 导出连接**:
- 在 Navicat 中，选择 "文件" -> "导出连接" 或 "工具" -> "导出连接"
- 选择要导出的连接，保存为 `.ncx` 文件
- 在本工具中选择该 `.ncx` 文件导入

**注意**: 
- Windows 系统会自动从注册表读取 Navicat 连接
- 支持导入 Navicat 导出的 `.ncx` 文件格式
- 某些版本的 Navicat 密码可能无法自动解密，需要手动输入密码

### 2. 执行 SQL 查询

1. 在连接树中选择一个数据库连接
2. 在 SQL 编辑器中输入 SQL 语句
3. 按 `F5` 或点击 "执行" 按钮执行查询
4. 查询结果会显示在下方的结果表格中

### 3. AI 智能 SQL 生成 🤖

1. 在 AI 输入框中输入自然语言描述
2. AI 会自动：
   - 选择相关表
   - 分析表结构
   - 生成准确的 SQL 语句
3. 生成的 SQL 会自动执行并显示结果

**特性**：
- 数据库类型感知：SQL 语法会根据数据库类型自动适配（MySQL、PostgreSQL 等）
- 表结构分析：自动使用正确的表名和列名
- 枚举字段识别：自动识别并使用正确的枚举值

### 4. 管理连接

- **编辑连接**: 右键点击连接 -> "编辑"
- **测试连接**: 右键点击连接 -> "测试连接"
- **删除连接**: 右键点击连接 -> "删除"

### 5. 语言设置 🌐

1. 点击菜单 "设置" -> "设置"
2. 选择您偏好的语言（中文/英文）
3. 重启应用使更改生效

**注意**: 语言设置会保存在 Windows 注册表（Windows）或配置文件（其他平台）中。

## 技术栈

- **GUI框架**: PyQt6
- **数据库**: SQLAlchemy
- **数据验证**: Pydantic
- **密码解密**: cryptography (用于 Navicat 导入)
- **AI集成**: OpenAI API 兼容
- **国际化**: 自定义 i18n 系统（支持 JSON/TS 文件）
- **Python版本**: >= 3.8

## 开发

### 运行测试
```bash
pytest
```

### 代码格式化
```bash
black src/
```

### 代码检查
```bash
flake8 src/
```

## 开源协议

本项目使用 **MIT License** 开源协议，你可以在遵守协议的前提下自由地使用、修改和分发本项目的源代码。  
详细条款见仓库根目录的 `LICENSE` 文件。

## 版本更新

### 最新更新

- **AI 智能 SQL 生成**: 自然语言转 SQL 功能
- **数据库类型感知**: SQL 生成会根据不同数据库类型自动适配
- **多语言支持**: 中英文界面切换
- **Navicat 导入**: 从 Navicat 导入数据库连接

### v0.2.0

- **查询结果表增强**
  - 支持在结果表中**直接编辑单元格**，自动生成并执行 `UPDATE` SQL，同步更新数据库
  - 支持**多选行**并右键删除所选数据，删除前有确认弹窗
  - 右键菜单新增：
    - **查看 JSON 数据**：查看当前行的完整 JSON 数据
    - **设置为NULL**：将选中的单元格批量设置为 `NULL` 并更新到数据库
  - 优化结果表选中样式：当前行浅色，高亮单元格颜色更深

- **状态栏统一**
  - 所有查询 / 编辑 / 删除的状态信息统一显示在**主窗口底部状态栏**
  - SQL 编辑器与结果区域内部的小状态条已隐藏，界面更简洁

- **打包和版本**
  - 默认使用 **MIT License** 开源
  - 版本号更新为 `0.2.0`，为后续发布二进制版本（如 `DataAI.exe`）做准备

## 功能规划

- [x] 从 Navicat 导入连接 🆕
- [x] AI 智能 SQL 生成 🤖
- [x] 多语言支持 🌐
- [x] AI 提示词中包含数据库类型
- [ ] SQL 语法高亮
- [ ] 查询历史记录
- [ ] 数据库表结构浏览
- [ ] 数据导出（Excel, JSON）
- [ ] 连接配置保存到文件
- [ ] 多标签页支持
- [ ] SQL 自动完成
- [ ] 查询计划分析

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
