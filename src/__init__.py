"""
GUI Application
"""
from datetime import datetime
import os

# 版本号生成策略：
# - 如果设置了 BUILD_VERSION 环境变量，使用该版本号（打包时自动设置）
# - 否则使用日期时间格式：YYYY.MM.DD.HHMM
def get_version():
    """获取版本号"""
    # 打包时会设置 BUILD_VERSION 环境变量
    build_version = os.environ.get('BUILD_VERSION')
    if build_version:
        return build_version
    
    # 开发环境：使用日期时间格式
    now = datetime.now()
    return now.strftime("%Y.%m.%d.%H%M")

__version__ = get_version()


