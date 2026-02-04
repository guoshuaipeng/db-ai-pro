"""
生成构建版本号脚本（打包时自动调用）
根据当前日期和时间生成版本号：YYYY.MM.DD.HHMM
"""
import sys
from pathlib import Path
from datetime import datetime
import re


def generate_build_version():
    """生成构建版本号"""
    now = datetime.now()
    version = now.strftime("%Y.%m.%d.%H%M")
    return version


def update_version_files(version: str):
    """
    更新版本号到相关文件
    
    Args:
        version: 版本号字符串，例如 "2025.01.20.1430"
    """
    project_root = Path(__file__).parent.parent
    
    # 1. 更新 src/__init__.py（通过环境变量，在打包时设置）
    # 注意：src/__init__.py 已经支持从环境变量读取，所以这里不需要修改
    
    # 2. 更新 pyproject.toml
    pyproject_file = project_root / "pyproject.toml"
    if pyproject_file.exists():
        content = pyproject_file.read_text(encoding='utf-8')
        # 更新 version = "xxx" 行
        content = re.sub(
            r'^version\s*=\s*"[^"]*"',
            f'version = "{version}"',
            content,
            flags=re.MULTILINE
        )
        pyproject_file.write_text(content, encoding='utf-8')
        print(f"✅ 已更新 pyproject.toml: version = {version}")
    
    # 3. 可选：更新 build_mac.spec 中的版本号（如果存在）
    build_mac_spec = project_root / "build_mac.spec"
    if build_mac_spec.exists():
        try:
            content = build_mac_spec.read_text(encoding='utf-8')
            # 更新 CFBundleShortVersionString 和 CFBundleVersion
            content = re.sub(
                r"'CFBundleShortVersionString':\s*'[^']*'",
                f"'CFBundleShortVersionString': '{version}'",
                content
            )
            content = re.sub(
                r"'CFBundleVersion':\s*'[^']*'",
                f"'CFBundleVersion': '{version}'",
                content
            )
            build_mac_spec.write_text(content, encoding='utf-8')
            print(f"✅ 已更新 build_mac.spec: version = {version}")
        except Exception as e:
            print(f"⚠️  更新 build_mac.spec 失败: {e}")
    
    return version


def save_version_to_file(version: str):
    """
    将版本号保存到文本文件
    
    Args:
        version: 版本号字符串
    """
    project_root = Path(__file__).parent.parent
    
    # 保存到项目根目录
    version_file = project_root / "VERSION.txt"
    try:
        with open(version_file, 'w', encoding='utf-8') as f:
            f.write(f"{version}\n")
            f.write(f"构建时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"格式: YYYY.MM.DD.HHMM\n")
        print(f"✅ 已保存版本号到文件: {version_file}")
    except Exception as e:
        print(f"⚠️  保存版本号文件失败: {e}")
    
    # 同时保存到 dist 目录（如果存在）
    dist_dir = project_root / "dist"
    if dist_dir.exists():
        dist_version_file = dist_dir / "VERSION.txt"
        try:
            with open(dist_version_file, 'w', encoding='utf-8') as f:
                f.write(f"{version}\n")
                f.write(f"构建时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write(f"格式: YYYY.MM.DD.HHMM\n")
            print(f"✅ 已保存版本号到打包目录: {dist_version_file}")
        except Exception as e:
            print(f"⚠️  保存版本号到打包目录失败: {e}")


def main():
    """主函数"""
    # 生成版本号
    version = generate_build_version()
    print(f"📦 生成构建版本号: {version}")
    
    # 更新文件
    update_version_files(version)
    
    # 保存版本号到文本文件
    save_version_to_file(version)
    
    # 设置环境变量（用于打包时使用）
    import os
    os.environ['BUILD_VERSION'] = version
    
    print(f"\n✨ 版本号已更新为: {version}")
    print(f"   格式: YYYY.MM.DD.HHMM")
    print(f"   示例: {version}\n")
    
    # 返回版本号（供其他脚本使用）
    # 最后一行输出版本号，供其他脚本捕获
    print(f"BUILD_VERSION={version}", file=sys.stdout)
    
    return version


if __name__ == "__main__":
    main()

