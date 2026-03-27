"""
全局 QSS 与查询范围条样式，统一视觉层级与间距。
"""
from PyQt6.QtWidgets import QApplication


def get_global_stylesheet() -> str:
    return """
    QMainWindow {
        background-color: #f3f4f6;
    }
    QToolBar {
        background-color: #ffffff;
        border: none;
        border-bottom: 1px solid #e5e7eb;
        spacing: 6px;
        padding: 4px 8px;
    }
    QToolBar::separator {
        background: #e5e7eb;
        width: 1px;
        margin: 4px 8px;
    }
    QMenuBar {
        background-color: #ffffff;
        border-bottom: 1px solid #e5e7eb;
        padding: 2px 4px;
    }
    QStatusBar {
        background-color: #fafafa;
        border-top: 1px solid #e5e7eb;
        padding: 2px 8px;
    }
    /* 仅主工作区标签页，避免嵌套在结果区内的 QTabWidget 重复套样式 */
    QTabWidget#mainWorkAreaTabs::pane {
        border: 1px solid #e5e7eb;
        border-radius: 0 0 6px 6px;
        background: #ffffff;
        top: -1px;
    }
    QTabWidget#mainWorkAreaTabs QTabBar::tab {
        background: #eceef2;
        border: 1px solid #e5e7eb;
        border-bottom: none;
        border-top-left-radius: 6px;
        border-top-right-radius: 6px;
        padding: 6px 14px;
        margin-right: 2px;
    }
    QTabWidget#mainWorkAreaTabs QTabBar::tab:selected {
        background: #ffffff;
        font-weight: 600;
    }
    QTabWidget#mainWorkAreaTabs QTabBar::tab:hover:!selected {
        background: #e5e7eb;
    }
    QComboBox {
        border: 1px solid #d1d5db;
        border-radius: 4px;
        padding: 4px 8px;
        min-height: 22px;
        background: #ffffff;
    }
    QComboBox:hover {
        border-color: #9ca3af;
    }
    QComboBox::drop-down {
        border: none;
        width: 22px;
    }
    QSplitter::handle:horizontal {
        width: 5px;
        background: #e5e7eb;
    }
    QSplitter::handle:vertical {
        height: 5px;
        background: #e5e7eb;
    }
    QSplitter::handle:hover {
        background: #cbd5e1;
    }
    """


def apply_app_theme(app: QApplication) -> None:
    """在创建主窗口之前调用，应用全局样式。"""
    app.setStyleSheet(get_global_stylesheet())
