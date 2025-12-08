"""
创建应用程序图标
"""
from PyQt6.QtGui import QIcon, QPixmap, QPainter, QColor, QFont, QPen
from PyQt6.QtCore import Qt, QSize
from pathlib import Path


def create_app_icon() -> QIcon:
    """创建应用程序图标"""
    # 创建不同尺寸的图标
    sizes = [16, 32, 48, 64, 128, 256]
    icon = QIcon()
    
    for size in sizes:
        pixmap = QPixmap(size, size)
        pixmap.fill(Qt.GlobalColor.transparent)
        
        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        # 绘制渐变背景（蓝色到紫色）
        margin = size // 8
        rect_size = size - margin * 2
        
        # 绘制圆角矩形背景
        painter.setBrush(QColor(33, 150, 243))  # 蓝色
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawRoundedRect(
            margin, margin, rect_size, rect_size,
            size // 6, size // 6
        )
        
        # 绘制数据库图标（简化的数据库符号）
        # 绘制三个水平线（表示数据表）
        line_width = max(1, size // 16)
        painter.setPen(QPen(QColor(255, 255, 255), line_width))
        
        # 绘制左侧的竖线（表示数据库）
        db_x = margin + rect_size // 4
        db_y1 = margin + rect_size // 3
        db_y2 = margin + rect_size * 2 // 3
        painter.drawLine(db_x, db_y1, db_x, db_y2)
        
        # 绘制三条水平线（表示表）
        line_spacing = rect_size // 6
        for i in range(3):
            y = db_y1 + line_spacing * (i + 1)
            painter.drawLine(db_x, y, db_x + rect_size // 2, y)
        
        # 绘制右侧的连接符号（表示连接）
        conn_x = margin + rect_size * 3 // 4
        conn_y = margin + rect_size // 2
        conn_radius = rect_size // 8
        
        # 绘制连接点
        painter.setBrush(QColor(255, 255, 255))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawEllipse(
            conn_x - conn_radius, conn_y - conn_radius,
            conn_radius * 2, conn_radius * 2
        )
        
        # 绘制连接线
        painter.setPen(QPen(QColor(255, 255, 255), line_width))
        painter.drawLine(
            db_x + rect_size // 2, conn_y,
            conn_x - conn_radius, conn_y
        )
        
        painter.end()
        
        # 添加到图标
        icon.addPixmap(pixmap)
    
    return icon


def save_icon_to_file(icon: QIcon, filepath: Path):
    """保存图标到文件"""
    # 保存为 PNG（用于开发）
    png_path = filepath.with_suffix('.png')
    pixmap = icon.pixmap(256, 256)
    pixmap.save(str(png_path), 'PNG')
    print(f"图标已保存到: {png_path}")
    
    # 注意：ICO 文件需要额外的库，这里只保存 PNG
    # 在 Windows 上，可以使用 PIL 或其他工具转换为 ICO


if __name__ == "__main__":
    from PyQt6.QtWidgets import QApplication
    import sys
    
    # 创建 QApplication（必需）
    app = QApplication(sys.argv)
    
    # 创建图标
    icon = create_app_icon()
    
    # 保存到文件
    icon_dir = Path(__file__).parent
    icon_path = icon_dir / "app_icon"
    save_icon_to_file(icon, icon_path)
    
    print("图标创建完成！")

