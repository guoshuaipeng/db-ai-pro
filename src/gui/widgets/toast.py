"""
Toast 通知组件
"""
from PyQt6.QtWidgets import QLabel, QGraphicsOpacityEffect, QWidget
from PyQt6.QtCore import QTimer, QPropertyAnimation, QEasingCurve, Qt, QRectF
from PyQt6.QtGui import QFont, QPainter, QColor, QPen, QPainterPath


class Toast(QLabel):
    """Toast 通知组件（自动消失的提示）"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        # 使用 SubWindow 而不是 ToolTip，避免样式问题
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint | 
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Tool
        )
        # 设置窗口背景透明，让圆角正确显示
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating)
        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        
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
    
    def paintEvent(self, event):
        """手动绘制圆角背景"""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        # 创建圆角矩形路径
        path = QPainterPath()
        rect = QRectF(0, 0, self.width(), self.height())
        path.addRoundedRect(rect, 20, 20)  # 20px 圆角
        
        # 绘制浅灰色半透明背景（更透明）
        painter.fillPath(path, QColor(230, 230, 230, 200))
        
        # 绘制浅灰色边框
        pen = QPen(QColor(0, 0, 0, 30))
        pen.setWidth(1)
        painter.setPen(pen)
        painter.drawPath(path)
        
        # 调用父类的 paintEvent 绘制文本
        super().paintEvent(event)
    
    def show_message(self, message: str, duration: int = 2000, message_type: str = "info"):
        """
        显示 Toast 消息
        
        :param message: 消息内容
        :param duration: 显示时长（毫秒）
        :param message_type: 消息类型 (info/success/warning/error)
        """
        # 设置文本
        self.setText(message)
        
        # 设置字体
        font = QFont()
        font.setFamily("Microsoft YaHei UI, Segoe UI, Arial")
        font.setPixelSize(14)
        font.setWeight(QFont.Weight.Medium)
        self.setFont(font)
        
        # 设置文字样式（背景由 paintEvent 绘制）
        self.setStyleSheet("""
            QLabel {
                background-color: transparent;
                color: #333333;
                padding: 10px 20px;
            }
        """)
        
        # 设置对齐和换行
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.setWordWrap(False)
        
        # 设置固定大小
        # 根据文本长度估算（中文字符约14px，英文约7-8px，emoji约16px）
        text_length = len(message)
        estimated_width = max(250, text_length * 12 + 50)
        estimated_width = min(estimated_width, 600)  # 最大600px
        
        self.resize(estimated_width, 50)
        
        # 居中显示（水平和垂直都居中）
        if self.parent():
            parent_geometry = self.parent().geometry()
            x = parent_geometry.x() + (parent_geometry.width() - self.width()) // 2
            y = parent_geometry.y() + (parent_geometry.height() - self.height()) // 2
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
