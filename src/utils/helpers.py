"""
辅助函数
"""
from pathlib import Path
from typing import Any


def get_project_root() -> Path:
    """获取项目根目录"""
    return Path(__file__).parent.parent.parent


def get_resource_path(relative_path: str) -> Path:
    """获取资源文件路径"""
    return get_project_root() / "resources" / relative_path


def format_size(size_bytes: int) -> str:
    """格式化文件大小"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} PB"


