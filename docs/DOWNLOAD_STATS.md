# 下载统计说明

## 📊 统计方案

有两种方式可以统计软件的下载量和使用情况：

### 方案 1: GitHub Releases 下载统计（推荐，无需代码）

**优点**：
- ✅ 无需修改代码
- ✅ GitHub 自动统计
- ✅ 免费使用
- ✅ 数据准确（实际下载量）

**如何查看**：

1. 访问 GitHub Releases 页面：
   ```
   https://github.com/guoshuaipeng/db-ai-pro/releases
   ```

2. 点击任意 Release，可以看到：
   - **每个安装包的下载次数**
   - **总下载量**
   - **下载趋势**

3. GitHub API 获取统计（程序化访问）：

   ```python
   import requests
   
   # 获取 Release 的下载统计
   url = "https://api.github.com/repos/guoshuaipeng/db-ai-pro/releases/latest"
   response = requests.get(url)
   data = response.json()
   
   total_downloads = 0
   for asset in data.get('assets', []):
       downloads = asset.get('download_count', 0)
       print(f"{asset['name']}: {downloads} 次下载")
       total_downloads += downloads
   
   print(f"总下载量: {total_downloads}")
   ```

**统计内容**：
- 每个 Release 的下载次数
- 每个安装包（.exe, .dmg, .AppImage）的单独统计
- 下载时间线

---

### 方案 2: 匿名使用统计（可选，需要服务器）

**优点**：
- ✅ 更详细的统计（启动次数、活跃用户等）
- ✅ 可以统计功能使用情况
- ✅ 跨版本统计

**缺点**：
- ⚠️ 需要搭建统计服务器
- ⚠️ 需要处理隐私问题（匿名统计）

**已实现的模块**：`src/core/usage_stats.py`

#### 如何启用匿名统计

1. **配置统计服务器 URL**（在 `src/core/usage_stats.py` 中）：

```python
# 统计服务器 URL（可选，如果不需要统计可以设置为 None）
STATS_API_URL = "https://your-domain.com/api/stats"  # 你的统计服务器地址
```

2. **在应用启动时发送统计**（在 `src/main.py` 中）：

```python
# 在 main() 函数中，主窗口显示后
from src.core.usage_stats import UsageStats

# 发送应用启动统计（可选）
UsageStats.send_app_start(enabled=True)  # 设置为 False 可禁用统计
```

3. **在更新检查时发送统计**（在 `src/gui/main_window.py` 中）：

```python
# 在 check_for_updates() 方法中
from src.core.usage_stats import UsageStats

# 发送更新检查统计
def on_no_update():
    UsageStats.send_update_check(has_update=False, enabled=True)
    # ... 其他代码 ...

def on_update_available(update_info):
    UsageStats.send_update_check(has_update=True, enabled=True)
    # ... 其他代码 ...
```

#### 统计服务器 API 格式

**请求方式**: POST  
**Content-Type**: application/json

**请求体示例**：

```json
{
    "event": "app_start",           // 事件类型: app_start, update_check
    "device_id": "uuid-string",     // 设备唯一标识（匿名）
    "version": "0.2.0",             // 应用版本
    "platform": "Windows",          // 操作系统: Windows, Darwin, Linux
    "arch": "AMD64"                 // 架构: x86_64, etc.
}
```

**事件类型**：
- `app_start`: 应用启动
- `update_check`: 更新检查（包含 `has_update: true/false`）

#### 统计服务器示例（Python Flask）

```python
from flask import Flask, request, jsonify
from datetime import datetime
import json

app = Flask(__name__)

@app.route('/api/stats', methods=['POST'])
def stats():
    data = request.json
    # 保存统计数据（可以保存到数据库）
    print(f"收到统计: {json.dumps(data, ensure_ascii=False)}")
    # ... 保存到数据库 ...
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

---

## 📈 推荐的统计方式

### 对于个人项目或小型项目

**推荐使用方案 1（GitHub Releases）**：
- 无需代码修改
- 自动统计下载量
- 足够了解软件受欢迎程度

**查看统计步骤**：
1. 访问 https://github.com/guoshuaipeng/db-ai-pro/releases
2. 查看每个 Release 的下载次数
3. 使用 GitHub API 获取详细统计（如果需要）

### 对于需要详细分析的项目

**推荐使用方案 2（匿名使用统计）**：
- 了解用户活跃度
- 统计功能使用情况
- 分析版本分布

**注意**：
- 必须声明使用统计并遵守隐私政策
- 建议使用匿名统计（不收集个人信息）
- 可以添加"允许统计"的设置选项

---

## 🔍 查看 GitHub 下载统计的脚本

创建一个脚本来查看下载统计：

```python
# scripts/view_download_stats.py
import requests
import json

def get_release_stats(owner: str, repo: str):
    """获取所有 Release 的下载统计"""
    url = f"https://api.github.com/repos/{owner}/{repo}/releases"
    response = requests.get(url)
    releases = response.json()
    
    print(f"\n📊 {owner}/{repo} 下载统计\n")
    print("=" * 80)
    
    total_all = 0
    for release in releases:
        tag = release.get('tag_name', 'Unknown')
        name = release.get('name', tag)
        created = release.get('created_at', '')[:10]
        
        print(f"\n📦 Release: {name} ({tag})")
        print(f"   发布时间: {created}")
        
        assets = release.get('assets', [])
        total_release = 0
        for asset in assets:
            name = asset.get('name', 'Unknown')
            downloads = asset.get('download_count', 0)
            total_release += downloads
            if downloads > 0:
                print(f"   - {name}: {downloads:,} 次下载")
        
        if total_release > 0:
            print(f"   小计: {total_release:,} 次下载")
        else:
            print("   (暂无下载)")
        
        total_all += total_release
    
    print("\n" + "=" * 80)
    print(f"📈 总下载量: {total_all:,} 次下载")
    print("=" * 80)

if __name__ == "__main__":
    get_release_stats("guoshuaipeng", "db-ai-pro")
```

**使用方法**：

```bash
pip install requests
python scripts/view_download_stats.py
```

---

## 📝 隐私说明

如果使用匿名统计（方案 2），建议：

1. **在用户协议或隐私政策中声明**：
   - 收集哪些数据（仅匿名统计）
   - 数据用途（改进软件）
   - 数据存储位置

2. **添加"允许统计"设置**：
   - 在设置对话框中添加开关
   - 默认可以启用，但用户可以选择禁用

3. **匿名化数据**：
   - 不收集 IP 地址
   - 不收集个人信息
   - 仅使用设备唯一标识（无法追溯到个人）

---

## 🚀 快速开始

**最简单的方式**：

1. 创建 GitHub Release
2. 上传安装包
3. 在 Releases 页面查看下载统计

**就这么简单！无需任何代码修改！**

如果需要更详细的统计，再考虑实现方案 2（匿名使用统计）。
