#!/usr/bin/env python3
"""
运行打包脚本的包装器
"""
import sys
import subprocess
import os
from pathlib import Path

def run_build_script(script_name: str):
    """运行打包脚本"""
    project_root = Path(__file__).parent.parent
    script_path = project_root / script_name
    
    if not script_path.exists():
        print(f"错误: 找不到脚本 {script_path}")
        sys.exit(1)
    
    print(f"正在运行: {script_name}")
    print("=" * 50)
    
    # 在 Windows 上，使用 cmd.exe 来运行批处理文件，确保编码正确
    if sys.platform == "win32":
        # 使用 os.system，让 cmd.exe 完全控制输出和编码
        # 这样可以避免 Python subprocess 的编码问题
        old_cwd = os.getcwd()
        try:
            os.chdir(str(project_root))
            exit_code = os.system(f'cmd.exe /c "{script_path}"')
            result = type('Result', (), {'returncode': exit_code >> 8 if exit_code else 0})()
        finally:
            os.chdir(old_cwd)
    else:
        # Linux/Mac 使用 shell 脚本
        result = subprocess.run(
            ["bash", str(script_path)],
            cwd=str(project_root),
            encoding='utf-8',
            errors='replace'
        )
    
    sys.exit(result.returncode)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python run_build.py <script_name>")
        print("例如: python run_build.py build_exe.bat")
        sys.exit(1)
    
    run_build_script(sys.argv[1])

