"""
Toast 通知组件 - 用于显示短暂的提示信息
"""
from PyQt6.QtWidgets import QWidget, QLabel, QVBoxLayout, QApplication, QMainWindow
from PyQt6.QtCore import Qt, QTimer, QPoint
from PyQt6.QtGui import QFont, QPainter, QColor


class Toast(QWidget):
    """Toast 通知组件"""
    
    def __init__(self, parent=None, message: str = "", duration: int = 2000):
        super().__init__(parent)
        self.duration = duration
        self.message = message
        self.setup_ui()
    
    def setup_ui(self):
        """设置UI"""
        # 创建布局和标签
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        self.setLayout(layout)
        
        self.label = QLabel(self.message)
        self.label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.label.setStyleSheet("""
            QLabel {
                background-color: transparent;
                color: white;
                padding: 10px 20px;
                font-size: 13px;
                font-weight: 500;
            }
        """)
        self.label.setFont(QFont("Microsoft YaHei", 10))
        layout.addWidget(self.label)
        
        # 设置窗口标志，使其显示在最上层
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint | 
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Tool |
            Qt.WindowType.SubWindow
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating, True)
        
        # 调整大小
        self.adjustSize()
        # 设置最小大小
        self.setMinimumWidth(200)
        self.setMinimumHeight(50)
    
    def paintEvent(self, event):
        """绘制圆角背景"""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        # 绘制圆角矩形背景
        rect = self.rect()
        painter.setBrush(QColor(50, 50, 50, 220))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawRoundedRect(rect, 6, 6)
        
        super().paintEvent(event)
    
    def _find_main_window(self, widget):
        """向上查找主窗口（QMainWindow）"""
        if widget is None:
            return None
        
        # 检查当前 widget 是否是主窗口
        if isinstance(widget, QMainWindow):
            return widget
        
        # 向上查找父窗口
        parent = widget.parent()
        while parent:
            if isinstance(parent, QMainWindow):
                return parent
            parent = parent.parent()
        
        # 如果找不到，尝试从 QApplication 获取活动窗口
        app = QApplication.instance()
        if app:
            active_window = app.activeWindow()
            if isinstance(active_window, QMainWindow):
                return active_window
        
        return None
    
    def show_toast(self, parent_widget=None):
        """显示Toast通知"""
        # 确保窗口已调整大小
        self.adjustSize()
        
        # 查找主窗口
        main_window = self._find_main_window(parent_widget)
        
        if main_window:
            # 显示在主窗口中央
            main_rect = main_window.geometry()
            x = main_rect.x() + (main_rect.width() - self.width()) // 2
            y = main_rect.y() + (main_rect.height() - self.height()) // 2
            self.move(x, y)
        else:
            # 如果找不到主窗口，显示在屏幕中央
            screen = QApplication.primaryScreen().geometry()
            x = (screen.width() - self.width()) // 2
            y = (screen.height() - self.height()) // 2
            self.move(x, y)
        
        # 显示
        self.show()
        self.raise_()
        
        # 设置定时器，自动关闭
        QTimer.singleShot(self.duration, self.close_and_delete)
    
    def close_and_delete(self):
        """关闭并删除Toast"""
        self.close()
        self.deleteLater()


def show_toast(message: str, parent=None, duration: int = 2000):
    """
    显示Toast通知的便捷函数
    
    Args:
        message: 要显示的消息
        parent: 父窗口（可选，用于定位Toast位置）
        duration: 显示时长（毫秒），默认2000ms
    """
    toast = Toast(parent, message, duration)
    toast.show_toast(parent)
    return toast

