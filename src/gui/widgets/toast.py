"""
Toast 通知组件
"""
from PyQt6.QtWidgets import QLabel, QGraphicsOpacityEffect
from PyQt6.QtCore import QTimer, QPropertyAnimation, QEasingCurve, Qt, pyqtProperty
from PyQt6.QtGui import QPalette, QColor


class Toast(QLabel):
    """Toast 通知组件（自动消失的提示）"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowFlags(Qt.WindowType.ToolTip | Qt.WindowType.FramelessWindowHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating)
        
        # 设置样式
        self.setStyleSheet("""
            QLabel {
                background-color: rgba(50, 50, 50, 220);
                color: white;
                padding: 12px 20px;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 500;
            }
        """)
        
        # 透明度效果
        self.opacity_effect = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(self.opacity_effect)
        self.opacity_effect.setOpacity(0.0)
        
        # 淡入动画
        self.fade_in_animation = QPropertyAnimation(self.opacity_effect, b"opacity")
        self.fade_in_animation.setDuration(200)
        self.fade_in_animation.setStartValue(0.0)
        self.fade_in_animation.setEndValue(1.0)
        self.fade_in_animation.setEasingCurve(QEasingCurve.Type.InOutQuad)
        
        # 淡出动画
        self.fade_out_animation = QPropertyAnimation(self.opacity_effect, b"opacity")
        self.fade_out_animation.setDuration(200)
        self.fade_out_animation.setStartValue(1.0)
        self.fade_out_animation.setEndValue(0.0)
        self.fade_out_animation.setEasingCurve(QEasingCurve.Type.InOutQuad)
        self.fade_out_animation.finished.connect(self.close)
        
        # 自动关闭定时器
        self.close_timer = QTimer(self)
        self.close_timer.timeout.connect(self._start_fade_out)
    
    def _start_fade_out(self):
        """开始淡出动画"""
        self.close_timer.stop()
        self.fade_out_animation.start()
    
    def show_message(self, message: str, duration: int = 2000, message_type: str = "info"):
        """
        显示 Toast 消息
        
        :param message: 消息内容
        :param duration: 显示时长（毫秒）
        :param message_type: 消息类型 (info/success/warning/error)
        """
        self.setText(message)
        self.adjustSize()
        
        # 根据消息类型设置不同的背景色
        colors = {
            "info": "rgba(50, 50, 50, 220)",
            "success": "rgba(67, 160, 71, 220)",  # 绿色
            "warning": "rgba(251, 140, 0, 220)",  # 橙色
            "error": "rgba(211, 47, 47, 220)"     # 红色
        }
        bg_color = colors.get(message_type, colors["info"])
        
        self.setStyleSheet(f"""
            QLabel {{
                background-color: {bg_color};
                color: white;
                padding: 12px 20px;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 500;
            }}
        """)
        
        # 居中显示
        if self.parent():
            parent_geometry = self.parent().geometry()
            x = parent_geometry.x() + (parent_geometry.width() - self.width()) // 2
            y = parent_geometry.y() + parent_geometry.height() - self.height() - 80
            self.move(x, y)
        
        # 显示并启动淡入动画
        self.show()
        self.raise_()
        self.fade_in_animation.start()
        
        # 设置自动关闭
        self.close_timer.start(duration)


def show_toast(parent, message: str, duration: int = 2000, message_type: str = "info"):
    """
    显示 Toast 通知的便捷函数
    
    :param parent: 父窗口
    :param message: 消息内容
    :param duration: 显示时长（毫秒）
    :param message_type: 消息类型 (info/success/warning/error)
    """
    toast = Toast(parent)
    toast.show_message(message, duration, message_type)
    return toast

