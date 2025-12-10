"""
全局 Toast 通知管理器
"""
from typing import Optional
from PyQt6.QtWidgets import QApplication


class ToastManager:
    """全局 Toast 管理器（单例）"""
    
    _instance = None
    _main_window = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    @classmethod
    def set_main_window(cls, main_window):
        """设置主窗口引用"""
        cls._main_window = main_window
    
    @classmethod
    def show(cls, message: str, duration: int = 2000, message_type: str = "info"):
        """
        显示 Toast 通知
        
        :param message: 消息内容
        :param duration: 显示时长（毫秒）
        :param message_type: 消息类型 (info/success/warning/error)
        """
        # 如果主窗口已设置，使用主窗口作为父窗口
        parent = cls._main_window
        
        # 如果没有主窗口，尝试获取活动窗口
        if not parent:
            parent = QApplication.activeWindow()
        
        # 如果还是没有，获取所有顶层窗口中的第一个
        if not parent:
            windows = QApplication.topLevelWidgets()
            for window in windows:
                if window.isVisible():
                    parent = window
                    break
        
        # 如果还是没有父窗口，直接返回
        if not parent:
            print(f"⚠️  无法显示 Toast: {message} (没有找到父窗口)")
            return
        
        # 导入并显示 Toast
        from src.gui.widgets.toast import show_toast
        show_toast(parent, message, duration, message_type)


# 全局便捷函数
def show_success(message: str, duration: int = 2000):
    """显示成功提示"""
    ToastManager.show(message, duration, "success")


def show_error(message: str, duration: int = 3000):
    """显示错误提示"""
    ToastManager.show(message, duration, "error")


def show_warning(message: str, duration: int = 3000):
    """显示警告提示"""
    ToastManager.show(message, duration, "warning")


def show_info(message: str, duration: int = 2000):
    """显示信息提示"""
    ToastManager.show(message, duration, "info")

