"""
更新对话框
"""
from PyQt6.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout, QLabel, 
                             QPushButton, QTextEdit, QProgressBar, QMessageBox)
from PyQt6.QtCore import Qt, QThread, pyqtSignal, QUrl
from PyQt6.QtGui import QFont, QDesktopServices
import logging
import sys
from pathlib import Path
import urllib.request
import platform

from src.core.update_checker import UpdateInfo

logger = logging.getLogger(__name__)


class UpdateDownloader(QThread):
    """更新下载器"""
    
    download_progress = pyqtSignal(int)  # 下载进度 (0-100)
    download_finished = pyqtSignal(str)  # 下载完成，参数为文件路径
    download_error = pyqtSignal(str)  # 下载错误
    
    def __init__(self, download_url: str, save_path: str):
        super().__init__()
        self.download_url = download_url
        self.save_path = save_path
        self._should_stop = False
    
    def stop(self):
        """停止下载"""
        self._should_stop = True
    
    def run(self):
        """下载文件"""
        try:
            # 创建保存目录
            save_dir = Path(self.save_path).parent
            save_dir.mkdir(parents=True, exist_ok=True)
            
            # 下载文件
            def progress_hook(count, block_size, total_size):
                if total_size > 0:
                    progress = int((count * block_size * 100) / total_size)
                    self.download_progress.emit(progress)
                else:
                    self.download_progress.emit(0)
                
                if self._should_stop:
                    raise InterruptedError("用户取消下载")
            
            urllib.request.urlretrieve(
                self.download_url,
                self.save_path,
                reporthook=lambda count, block_size, total_size: progress_hook(
                    count, block_size, total_size
                )
            )
            
            self.download_finished.emit(self.save_path)
            
        except InterruptedError:
            logger.info("用户取消下载")
            self.download_error.emit("下载已取消")
        except Exception as e:
            logger.error(f"下载失败: {e}", exc_info=True)
            self.download_error.emit(f"下载失败: {str(e)}")


class UpdateDialog(QDialog):
    """更新对话框"""
    
    def __init__(self, update_info: UpdateInfo, parent=None):
        super().__init__(parent)
        self.update_info = update_info
        self.downloader = None
        self.download_path = None
        
        self.setWindowTitle("发现新版本")
        self.setModal(True)
        self.resize(600, 500)
        
        self.init_ui()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        layout.setSpacing(15)
        layout.setContentsMargins(20, 20, 20, 20)
        
        # 标题
        title_label = QLabel(f"🎉 发现新版本 v{self.update_info.version}")
        title_font = QFont()
        title_font.setPointSize(16)
        title_font.setBold(True)
        title_label.setFont(title_font)
        title_label.setStyleSheet("color: #1976d2;")
        layout.addWidget(title_label)
        
        # 当前版本信息
        from src import __version__
        current_version_label = QLabel(f"当前版本: v{__version__} → 最新版本: v{self.update_info.version}")
        current_version_label.setStyleSheet("color: #7f8c8d; font-size: 12px;")
        layout.addWidget(current_version_label)
        
        # 是否强制更新
        if self.update_info.mandatory:
            mandatory_label = QLabel("⚠️ 这是强制更新，请尽快升级")
            mandatory_label.setStyleSheet("color: #e74c3c; font-weight: bold;")
            layout.addWidget(mandatory_label)
        
        # 更新日志
        release_notes_label = QLabel("📝 更新内容:")
        release_notes_label.setStyleSheet("font-weight: bold;")
        layout.addWidget(release_notes_label)
        
        release_notes_text = QTextEdit()
        release_notes_text.setReadOnly(True)
        release_notes_text.setMaximumHeight(200)
        release_notes_text.setPlainText(self.update_info.release_notes or "暂无更新日志")
        layout.addWidget(release_notes_text)
        
        # 下载进度条（初始隐藏）
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        self.progress_bar.setRange(0, 100)
        layout.addWidget(self.progress_bar)
        
        # 按钮区域
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        # 稍后提醒按钮（仅在非强制更新时显示）
        if not self.update_info.mandatory:
            self.later_btn = QPushButton("稍后提醒")
            self.later_btn.clicked.connect(self.reject)
            button_layout.addWidget(self.later_btn)
        
        # 下载按钮
        self.download_btn = QPushButton("立即下载")
        self.download_btn.clicked.connect(self.start_download)
        self.download_btn.setStyleSheet("""
            QPushButton {
                background-color: #1976d2;
                color: white;
                padding: 8px 20px;
                border-radius: 4px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #1565c0;
            }
        """)
        button_layout.addWidget(self.download_btn)
        
        # 浏览器打开按钮（可选）
        self.browser_btn = QPushButton("在浏览器中打开")
        self.browser_btn.clicked.connect(self.open_in_browser)
        button_layout.addWidget(self.browser_btn)
        
        layout.addLayout(button_layout)
        
        self.setLayout(layout)
    
    def start_download(self):
        """开始下载"""
        # 确定保存路径
        if platform.system() == 'Windows':
            downloads_dir = Path.home() / "Downloads"
        elif platform.system() == 'Darwin':
            downloads_dir = Path.home() / "Downloads"
        else:  # Linux
            downloads_dir = Path.home() / "Downloads"
        
        # 从 URL 中提取文件名
        filename = self.update_info.download_url.split('/')[-1].split('?')[0]
        if not filename or '.' not in filename:
            # 如果无法从 URL 提取，使用默认名称
            ext = '.exe' if platform.system() == 'Windows' else '.dmg' if platform.system() == 'Darwin' else '.AppImage'
            filename = f"DataAI-{self.update_info.version}{ext}"
        
        self.download_path = str(downloads_dir / filename)
        
        # 禁用下载按钮
        self.download_btn.setEnabled(False)
        self.download_btn.setText("下载中...")
        
        # 显示进度条
        self.progress_bar.setVisible(True)
        self.progress_bar.setValue(0)
        
        # 启动下载线程
        self.downloader = UpdateDownloader(self.update_info.download_url, self.download_path)
        self.downloader.download_progress.connect(self.on_download_progress)
        self.downloader.download_finished.connect(self.on_download_finished)
        self.downloader.download_error.connect(self.on_download_error)
        self.downloader.start()
    
    def on_download_progress(self, progress: int):
        """下载进度更新"""
        self.progress_bar.setValue(progress)
    
    def on_download_finished(self, file_path: str):
        """下载完成"""
        self.progress_bar.setValue(100)
        self.download_btn.setText("下载完成")
        
        # 询问是否立即安装
        reply = QMessageBox.question(
            self,
            "下载完成",
            f"更新文件已下载到:\n{file_path}\n\n是否立即安装？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            self.install_update(file_path)
        else:
            QMessageBox.information(
                self,
                "提示",
                f"更新文件已保存到:\n{file_path}\n\n请稍后手动安装。"
            )
            self.accept()
    
    def on_download_error(self, error_msg: str):
        """下载错误"""
        QMessageBox.critical(self, "下载失败", error_msg)
        self.download_btn.setEnabled(True)
        self.download_btn.setText("重新下载")
        self.progress_bar.setVisible(False)
    
    def install_update(self, file_path: str):
        """安装更新"""
        try:
            import os
            import subprocess
            
            if platform.system() == 'Windows':
                # Windows: 直接运行 exe
                os.startfile(file_path)
            elif platform.system() == 'Darwin':
                # macOS: 打开 dmg
                subprocess.Popen(['open', file_path])
            else:  # Linux
                # Linux: 设置执行权限并运行
                os.chmod(file_path, 0o755)
                subprocess.Popen([file_path])
            
            # 关闭当前应用
            QMessageBox.information(
                self,
                "安装提示",
                "安装程序已启动，请按照提示完成安装。\n\n安装完成后，请重新启动应用。"
            )
            self.accept()
            
        except Exception as e:
            logger.error(f"启动安装程序失败: {e}", exc_info=True)
            QMessageBox.critical(
                self,
                "错误",
                f"无法启动安装程序:\n{str(e)}\n\n请手动运行:\n{file_path}"
            )
    
    def open_in_browser(self):
        """在浏览器中打开下载页面"""
        try:
            QDesktopServices.openUrl(QUrl(self.update_info.download_url))
        except Exception as e:
            logger.error(f"打开浏览器失败: {e}")
            QMessageBox.warning(self, "错误", f"无法打开浏览器:\n{str(e)}")
