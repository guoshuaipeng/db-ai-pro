"""
UI 辅助工具
"""
from PyQt6.QtGui import QIcon, QPixmap, QPainter, QColor, QFont, QPen
from PyQt6.QtCore import Qt, QSize
from src.core.database_connection import DatabaseType


def get_connection_icon(size: int = 16) -> QIcon:
    """获取连接图标（连接/服务器图标，蓝色）"""
    pixmap = QPixmap(size, size)
    pixmap.fill(Qt.GlobalColor.transparent)
    
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    
    # 绘制连接图标（两个圆形通过线连接，表示连接）
    margin = 2
    color = QColor(66, 165, 245)  # 蓝色
    
    # 绘制左侧圆形（服务器/节点）
    left_circle_size = size // 3
    left_x = margin
    left_y = (size - left_circle_size) // 2
    painter.setBrush(color)
    painter.setPen(Qt.PenStyle.NoPen)
    painter.drawEllipse(left_x, left_y, left_circle_size, left_circle_size)
    
    # 绘制右侧圆形（服务器/节点）
    right_circle_size = size // 3
    right_x = size - margin - right_circle_size
    right_y = (size - right_circle_size) // 2
    painter.drawEllipse(right_x, right_y, right_circle_size, right_circle_size)
    
    # 绘制连接线
    line_color = color
    line_width = max(1, size // 8)
    painter.setPen(QPen(line_color, line_width))
    line_y = size // 2
    painter.drawLine(left_x + left_circle_size, line_y, right_x, line_y)
    
    painter.end()
    return QIcon(pixmap)


def get_database_icon_simple(size: int = 16, color: QColor = None) -> QIcon:
    """获取数据库图标（圆柱形数据库图标，绿色）"""
    if color is None:
        color = QColor(76, 175, 80)  # 绿色
    
    pixmap = QPixmap(size, size)
    pixmap.fill(Qt.GlobalColor.transparent)
    
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    
    margin = 1
    width = size - margin * 2
    height = size - margin * 2
    
    # 绘制数据库圆柱体（椭圆顶部 + 矩形主体）
    # 顶部椭圆（表示数据库的顶部）
    ellipse_height = height // 3
    painter.setBrush(color)
    painter.setPen(Qt.PenStyle.NoPen)
    painter.drawEllipse(margin, margin, width, ellipse_height)
    
    # 主体矩形（表示数据库的主体）
    rect_y = margin + ellipse_height // 2
    rect_height = height - ellipse_height // 2
    painter.drawRect(margin, rect_y, width, rect_height)
    
    # 绘制底部的椭圆（表示数据库的底部）
    bottom_y = size - margin - ellipse_height // 2
    painter.drawEllipse(margin, bottom_y, width, ellipse_height)
    
    # 绘制三条水平线（表示数据层）
    line_color = QColor(255, 255, 255)
    painter.setPen(QPen(line_color, 1))
    line_spacing = rect_height // 4
    for i in range(1, 4):
        y = rect_y + line_spacing * i
        if y < size - margin - ellipse_height // 4:
            painter.drawLine(margin + 2, y, size - margin - 2, y)
    
    painter.end()
    return QIcon(pixmap)


def get_table_icon(size: int = 16) -> QIcon:
    """获取表图标（表格图标，蓝色）"""
    pixmap = QPixmap(size, size)
    pixmap.fill(Qt.GlobalColor.transparent)
    
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    
    margin = 2
    width = size - margin * 2
    height = size - margin * 2
    color = QColor(33, 150, 243)  # 蓝色
    
    # 绘制表格边框
    painter.setPen(QPen(color, 2))
    painter.setBrush(Qt.GlobalColor.transparent)
    painter.drawRoundedRect(margin, margin, width, height, 2, 2)
    
    # 绘制表格的行（水平线）
    line_color = color
    painter.setPen(QPen(line_color, 1))
    row_count = 3
    row_spacing = height // (row_count + 1)
    for i in range(1, row_count + 1):
        y = margin + row_spacing * i
        painter.drawLine(margin + 2, y, size - margin - 2, y)
    
    # 绘制表格的列（垂直线）
    col_count = 2
    col_spacing = width // (col_count + 1)
    for i in range(1, col_count + 1):
        x = margin + col_spacing * i
        painter.drawLine(x, margin + 2, x, size - margin - 2)
    
    painter.end()
    return QIcon(pixmap)


def get_category_icon(category: str, size: int = 16) -> QIcon:
    """获取分类图标"""
    # 如果分类是"表"，直接返回表图标
    if category == "表":
        return get_table_icon(size)
    
    # 其他分类需要绘制
    pixmap = QPixmap(size, size)
    pixmap.fill(Qt.GlobalColor.transparent)
    
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    
    if category == "视图":
        # 眼睛图标（简化）
        color = QColor(156, 39, 176)  # 紫色
        painter.setBrush(color)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawEllipse(2, 2, size - 4, size - 4)
    elif category == "函数":
        # fx 图标（简化）
        color = QColor(255, 152, 0)  # 橙色
        painter.setBrush(color)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawRoundedRect(2, 2, size - 4, size - 4, 2, 2)
    else:
        # 默认灰色
        color = QColor(158, 158, 158)
        painter.setBrush(color)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawEllipse(2, 2, size - 4, size - 4)
    
    painter.end()
    return QIcon(pixmap)


def get_database_icon(db_type: DatabaseType, size: int = 16) -> QIcon:
    """获取数据库类型图标"""
    # 创建彩色图标
    pixmap = QPixmap(size, size)
    pixmap.fill(Qt.GlobalColor.transparent)
    
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    
    # 根据数据库类型设置颜色
    colors = {
        DatabaseType.MYSQL: QColor(0, 117, 202),  # MySQL 蓝色
        DatabaseType.MARIADB: QColor(197, 0, 0),  # MariaDB 红色
        DatabaseType.POSTGRESQL: QColor(49, 97, 149),  # PostgreSQL 蓝色
        DatabaseType.SQLITE: QColor(0, 128, 128),  # SQLite 青色
        DatabaseType.ORACLE: QColor(244, 67, 54),  # Oracle 红色
        DatabaseType.SQLSERVER: QColor(0, 120, 215),  # SQL Server 蓝色
    }
    
    color = colors.get(db_type, QColor(100, 100, 100))
    
    # 绘制圆形图标
    margin = 2
    painter.setBrush(color)
    painter.setPen(Qt.PenStyle.NoPen)
    painter.drawEllipse(margin, margin, size - margin * 2, size - margin * 2)
    
    # 添加字母标识
    painter.setPen(QColor(255, 255, 255))
    font = QFont("Arial", size // 2, QFont.Weight.Bold)
    painter.setFont(font)
    
    # 获取首字母
    letter = db_type.value[0].upper() if db_type.value else "?"
    painter.drawText(
        pixmap.rect(),
        Qt.AlignmentFlag.AlignCenter,
        letter
    )
    
    painter.end()
    
    return QIcon(pixmap)


def format_connection_display(connection) -> str:
    """格式化连接显示文本"""
    # 显示格式: 连接名称
    #           数据库类型 • 主机:端口/数据库
    db_type_name = {
        DatabaseType.MYSQL: "MySQL",
        DatabaseType.MARIADB: "MariaDB",
        DatabaseType.POSTGRESQL: "PostgreSQL",
        DatabaseType.SQLITE: "SQLite",
        DatabaseType.ORACLE: "Oracle",
        DatabaseType.SQLSERVER: "SQL Server",
    }.get(connection.db_type, connection.db_type.value)
    
    if connection.db_type == DatabaseType.SQLITE:
        # SQLite 显示文件路径
        display = f"{connection.name}\n{connection.database}"
    else:
        # 其他数据库显示连接信息
        display = (
            f"{connection.name}\n"
            f"{db_type_name} • {connection.host}:{connection.port}/{connection.database}"
        )
    
    return display

