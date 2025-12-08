"""
主程序测试
"""
import pytest
from PyQt6.QtWidgets import QApplication
from src.gui.main_window import MainWindow
from src.config.settings import Settings


@pytest.fixture
def app():
    """创建QApplication实例"""
    application = QApplication.instance()
    if application is None:
        application = QApplication([])
    return application


@pytest.fixture
def settings():
    """创建设置实例"""
    return Settings()


@pytest.fixture
def window(app, settings):
    """创建主窗口实例"""
    return MainWindow(settings)


def test_main_window_creation(window):
    """测试主窗口创建"""
    assert window is not None
    assert window.windowTitle() == "GUI Application"


def test_settings_loading(settings):
    """测试设置加载"""
    assert settings.app_name == "GUI Application"
    assert settings.window_width == 800
    assert settings.window_height == 600


