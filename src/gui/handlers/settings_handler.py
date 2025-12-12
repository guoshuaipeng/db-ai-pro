"""
设置和语言处理器
"""
from PyQt6.QtWidgets import QMessageBox, QApplication
from typing import TYPE_CHECKING
import sys
import os
import subprocess
import logging

from src.gui.dialogs.settings_dialog import SettingsDialog
from src.gui.dialogs.schema_sync_dialog import SchemaSyncDialog

if TYPE_CHECKING:
    from src.gui.main_window import MainWindow

logger = logging.getLogger(__name__)


class SettingsHandler:
    """设置和语言处理器"""
    
    def __init__(self, main_window: 'MainWindow'):
        self.main_window = main_window
    
    def show_settings(self):
        """显示设置对话框"""
        dialog = SettingsDialog(self.main_window, self.main_window.settings, self.main_window.translation_manager)
        dialog.language_changed.connect(self.on_language_changed)
        dialog.exec()
    
    def on_language_changed(self, new_language: str):
        """语言改变时的回调"""
        if self.main_window.translation_manager:
            # 更新设置（已经保存到注册表）
            self.main_window.settings.language = new_language
            
            # 提示用户需要重启应用
            reply = QMessageBox.information(
                self.main_window,
                self.main_window.tr("语言设置"),
                self.main_window.tr("语言设置已保存到注册表。\n\n需要重启应用程序才能使语言更改生效。\n\n是否现在重启？"),
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.Yes
            )
            
            if reply == QMessageBox.StandardButton.Yes:
                # 重启应用
                self.restart_application()
    
    def restart_application(self):
        """重启应用程序"""
        try:
            # 获取应用程序路径
            if getattr(sys, 'frozen', False):
                # 如果是打包后的可执行文件
                executable = sys.executable
                args = [executable]
            else:
                # 如果是开发模式，使用 Python 解释器
                executable = sys.executable
                script = sys.argv[0]
                args = [executable, script]
            
            # 添加原始命令行参数（跳过脚本名）
            if len(sys.argv) > 1:
                args.extend(sys.argv[1:])
            
            # 使用 subprocess 启动新进程
            # 在 Windows 上使用 CREATE_NEW_CONSOLE 标志
            if sys.platform == "win32":
                subprocess.Popen(
                    args,
                    creationflags=subprocess.CREATE_NEW_CONSOLE
                )
            else:
                subprocess.Popen(args)
            
            # 关闭当前应用
            QApplication.instance().quit()
        except Exception as e:
            logger.error(f"重启应用失败: {e}")
            QMessageBox.warning(
                self.main_window,
                self.main_window.tr("错误"),
                self.main_window.tr("重启应用失败，请手动重启应用程序。")
            )
    
    def show_schema_sync(self):
        """显示结构同步对话框"""
        dialog = SchemaSyncDialog(self.main_window, self.main_window.db_manager)
        dialog.exec()
    
    def show_about(self):
        """显示关于对话框"""
        from src.gui.dialogs.about_dialog import AboutDialog
        dialog = AboutDialog(self.main_window)
        dialog.exec()

