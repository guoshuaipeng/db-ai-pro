# 打包时嵌入默认AI模型配置

本功能允许在打包时将默认的AI模型配置（包括API密钥）编译到exe中，用户首次运行时无需手动配置。

## 安全说明

⚠️ **重要提示**：
- API密钥会被编译到exe文件中，虽然使用了base64编码，但**不能完全防止逆向工程**
- 建议仅用于内部使用或信任的环境
- 不要将包含真实API密钥的exe文件分享给不信任的用户
- 生成的 `src/core/embedded_ai_config.py` 文件已添加到 `.gitignore`，不会提交到代码仓库

## 打包脚本说明

项目提供了两个打包脚本：

1. **`build_exe.bat` / `build_exe.sh`** - 标准打包脚本（**不包含**默认AI配置）
   - 适用于开发、测试环境
   - 用户需要手动配置AI模型
   - 生成文件名：`DataAI-Community.exe` / `DataAI-Community`（社区版）

2. **`build_exe_with_config.bat` / `build_exe_with_config.sh`** - 内置配置打包脚本（**包含**默认AI配置）
   - 适用于生产环境
   - 需要设置环境变量来指定默认配置
   - 会将配置编译到exe中
   - 生成文件名：`DataAI-Pro.exe` / `DataAI-Pro`（专业版）

## 使用方法

### 方式一：使用内置配置脚本（推荐用于生产环境）

#### Windows

1. 设置环境变量：
```batch
set DATAAI_DEFAULT_AI_API_KEY=your-api-key-here
set DATAAI_DEFAULT_AI_NAME=默认配置
set DATAAI_DEFAULT_AI_PROVIDER=aliyun_qianwen
set DATAAI_DEFAULT_AI_DEFAULT_MODEL=qwen-plus
set DATAAI_DEFAULT_AI_TURBO_MODEL=qwen-turbo
```

2. 运行内置配置打包脚本：
```batch
build_exe_with_config.bat
```

#### Linux/Mac

1. 设置环境变量：
```bash
export DATAAI_DEFAULT_AI_API_KEY=your-api-key-here
export DATAAI_DEFAULT_AI_NAME=默认配置
export DATAAI_DEFAULT_AI_PROVIDER=aliyun_qianwen
export DATAAI_DEFAULT_AI_DEFAULT_MODEL=qwen-plus
export DATAAI_DEFAULT_AI_TURBO_MODEL=qwen-turbo
```

2. 运行内置配置打包脚本：
```bash
chmod +x build_exe_with_config.sh
./build_exe_with_config.sh
```

### 方式二：使用标准打包脚本（推荐用于开发/测试）

#### Windows
```batch
build_exe.bat
```

#### Linux/Mac
```bash
chmod +x build_exe.sh
./build_exe.sh
```

**注意**：标准打包脚本不会包含默认AI配置，用户首次运行需要手动配置。

### 环境变量说明

| 环境变量 | 必需 | 默认值 | 说明 |
|---------|------|--------|------|
| `DATAAI_DEFAULT_AI_API_KEY` | ✅ 是 | - | API密钥（必需） |
| `DATAAI_DEFAULT_AI_NAME` | ❌ 否 | "默认配置" | 配置名称 |
| `DATAAI_DEFAULT_AI_PROVIDER` | ❌ 否 | "aliyun_qianwen" | 提供商：`aliyun_qianwen` 或 `openai` |
| `DATAAI_DEFAULT_AI_BASE_URL` | ❌ 否 | `None` | 基础URL（可选，None则使用默认URL） |
| `DATAAI_DEFAULT_AI_DEFAULT_MODEL` | ❌ 否 | "qwen-plus" | 默认模型名称 |
| `DATAAI_DEFAULT_AI_TURBO_MODEL` | ❌ 否 | "qwen-turbo" | Turbo模型名称 |

### 示例

#### 阿里云通义千问
```batch
set DATAAI_DEFAULT_AI_API_KEY=sk-xxxxxxxxxxxxx
set DATAAI_DEFAULT_AI_NAME=通义千问
set DATAAI_DEFAULT_AI_PROVIDER=aliyun_qianwen
set DATAAI_DEFAULT_AI_DEFAULT_MODEL=qwen-plus
set DATAAI_DEFAULT_AI_TURBO_MODEL=qwen-turbo
build_exe_with_config.bat
```

#### OpenAI
```batch
set DATAAI_DEFAULT_AI_API_KEY=sk-xxxxxxxxxxxxx
set DATAAI_DEFAULT_AI_NAME=OpenAI
set DATAAI_DEFAULT_AI_PROVIDER=openai
set DATAAI_DEFAULT_AI_BASE_URL=https://api.openai.com/v1
set DATAAI_DEFAULT_AI_DEFAULT_MODEL=gpt-4
set DATAAI_DEFAULT_AI_TURBO_MODEL=gpt-3.5-turbo
build_exe_with_config.bat
```

## 工作原理

1. 打包脚本会调用 `scripts/generate_embedded_config.py`
2. 该脚本读取环境变量，生成 `src/core/embedded_ai_config.py` 文件
3. 生成的文件包含默认配置（API密钥使用base64编码）
4. PyInstaller 将生成的配置文件打包进exe
5. 程序首次运行时，如果用户目录下没有配置文件，会自动使用嵌入的默认配置

## 注意事项

1. **脚本选择**：
   - 使用 `build_exe_with_config.bat/sh` 时，**必须**设置 `DATAAI_DEFAULT_AI_API_KEY` 环境变量，否则脚本会报错退出
   - 使用 `build_exe.bat/sh` 时，不会检查环境变量，打包后的exe不包含默认配置

2. **配置文件位置**：生成的 `src/core/embedded_ai_config.py` 会被 `.gitignore` 忽略，不会提交到代码仓库

3. **覆盖现有配置**：如果用户目录下已有配置文件，不会使用嵌入的默认配置

4. **安全性**：虽然使用了编码，但API密钥仍然可以被逆向工程提取，请谨慎使用

5. **开发建议**：
   - 开发/测试时使用 `build_exe.bat/sh`（不包含配置）
   - 生产环境使用 `build_exe_with_config.bat/sh`（包含配置）

