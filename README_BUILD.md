# 打包说明

项目提供了两个打包脚本，可根据需求选择使用。

## 打包脚本对比

| 脚本 | 用途 | 是否包含默认AI配置 | 生成文件名 | 适用场景 |
|------|------|-------------------|-----------|---------|
| `build_exe.bat` / `build_exe.sh` | 标准打包 | ❌ 否 | `DataAI-Community.exe` / `DataAI-Community` | 开发、测试环境（社区版） |
| `build_exe_with_config.bat` / `build_exe_with_config.sh` | 内置配置打包 | ✅ 是 | `DataAI-Pro.exe` / `DataAI-Pro` | 生产环境（专业版） |

## 快速开始

### 标准打包（不包含默认配置）

**Windows:**
```batch
build_exe.bat
```

**Linux/Mac:**
```bash
chmod +x build_exe.sh
./build_exe.sh
```

### 内置配置打包（包含默认配置）

**Windows:**
```batch
set DATAAI_DEFAULT_AI_API_KEY=your-api-key-here
set DATAAI_DEFAULT_AI_NAME=默认配置
build_exe_with_config.bat
```

**Linux/Mac:**
```bash
export DATAAI_DEFAULT_AI_API_KEY=your-api-key-here
export DATAAI_DEFAULT_AI_NAME=默认配置
chmod +x build_exe_with_config.sh
./build_exe_with_config.sh
```

## 详细说明

更多关于内置配置打包的详细信息，请参阅 [docs/BUILD_WITH_DEFAULT_AI_CONFIG.md](docs/BUILD_WITH_DEFAULT_AI_CONFIG.md)
