"""
应用程序入口点
"""
import sys
import logging
from pathlib import Path



# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


# 配置日志系统
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(sys.stdout)  # 输出到控制台
    ]
)

from PyQt6.QtWidgets import QApplication
from PyQt6.QtGui import QIcon
from PyQt6.QtCore import Qt
from src.gui.main_window import MainWindow
from src.config.settings import Settings
from src.core.i18n import TranslationManager


def get_app_icon() -> QIcon:
    """获取应用程序图标"""
    # 检查是否是PyInstaller打包后的环境
    if getattr(sys, 'frozen', False):
        # PyInstaller打包后的环境，使用sys._MEIPASS获取临时目录
        base_path = Path(sys._MEIPASS)
    else:
        # 开发环境，使用项目根目录
        base_path = project_root
    
    # 优先尝试加载ICO文件（Windows任务栏需要）
    ico_path = base_path / "resources" / "icons" / "app_icon.ico"
    if ico_path.exists():
        return QIcon(str(ico_path))
    
    # 其次尝试PNG文件
    icon_path = base_path / "resources" / "icons" / "app_icon.png"
    if icon_path.exists():
        return QIcon(str(icon_path))
    
    # 如果文件不存在，动态创建图标（仅在开发环境）
    if not getattr(sys, 'frozen', False):
        import importlib.util
        icon_script = project_root / "resources" / "icons" / "create_app_icon.py"
        if icon_script.exists():
            try:
                spec = importlib.util.spec_from_file_location("create_app_icon", icon_script)
                module = importlib.util.module_from_spec(spec)
                sys.modules["create_app_icon"] = module
                spec.loader.exec_module(module)
                return module.create_app_icon()
            except Exception as e:
                print(f"创建图标失败: {e}")
    
    # 如果都失败，返回空图标
    return QIcon()


def setup_windows_taskbar_icon(app: QApplication):
    """设置Windows任务栏图标（需要AppUserModelID）"""
    if sys.platform == "win32":
        try:
            # 设置AppUserModelID，用于Windows任务栏图标识别
            # 这个ID必须是唯一的，格式通常是：CompanyName.ProductName.SubProduct.VersionInformation
            app_id = "DataAI.DataAI.1.0"
            
            try:
                # 使用ctypes设置AppUserModelID（Windows 7+）
                # 必须在创建窗口之前设置，否则任务栏图标可能不显示
                import ctypes
                # 使用windll而不是cdll，确保使用正确的调用约定
                shell32 = ctypes.windll.shell32
                shell32.SetCurrentProcessExplicitAppUserModelID(app_id)
                logger = logging.getLogger(__name__)
                logger.debug(f"已设置AppUserModelID: {app_id}")
            except Exception as e:
                # 如果失败，尝试使用win32api（如果可用）
                try:
                    import win32api
                    win32api.SetCurrentProcessExplicitAppUserModelID(app_id)
                    logger = logging.getLogger(__name__)
                    logger.debug(f"已设置AppUserModelID (win32api): {app_id}")
                except ImportError:
                    pass  # win32api不可用，忽略
                except Exception:
                    pass  # 设置失败，忽略
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.warning(f"设置AppUserModelID失败: {e}")
            # 如果设置失败，不影响程序运行


def main():
    """主函数"""
    # 创建应用程序
    app = QApplication(sys.argv)
    app.setApplicationName("DataAI")
    app.setOrganizationName("DataAI")
    
    # 设置Windows任务栏图标
    setup_windows_taskbar_icon(app)
    
    # 设置应用程序图标
    app_icon = get_app_icon()
    app.setWindowIcon(app_icon)
    
    # 加载配置
    settings = Settings()
    
    # 打印当前语言设置（用于调试）
    logger = logging.getLogger(__name__)
    logger.info(f"当前语言设置: {settings.language}")
    
    # 初始化翻译系统
    translation_manager = TranslationManager(app)
    load_success = translation_manager.load_translation(settings.language)
    
    if not load_success and settings.language != "zh_CN":
        logger.warning(f"加载翻译失败，使用默认语言: zh_CN")
        settings.language = "zh_CN"
        translation_manager.load_translation("zh_CN")
    
    logger.info(f"翻译系统已初始化，当前语言: {translation_manager.get_current_language()}")
    
    # 创建主窗口
    window = MainWindow(settings, translation_manager)
    window.setWindowIcon(app_icon)
    
    # 最大化显示窗口
    window.showMaximized()
    
    # 运行应用程序
    sys.exit(app.exec())


if __name__ == "__main__":
    main()


