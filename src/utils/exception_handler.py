"""
全局异常处理工具
捕获未处理的异常，特别是 QThread 相关的错误，避免程序崩溃
"""
import sys
import logging
import traceback
from typing import Optional
from PyQt6.QtWidgets import QApplication, QMessageBox
from PyQt6.QtCore import Qt, QtMsgType

# 导入 Qt 消息处理函数
try:
    from PyQt6.QtCore import qInstallMessageHandler
except ImportError:
    # PyQt6 中 qInstallMessageHandler 在 QtCore 中，如果导入失败则使用备用方案
    qInstallMessageHandler = None

logger = logging.getLogger(__name__)


class ExceptionHandler:
    """全局异常处理器"""
    
    _original_excepthook = None
    _original_qt_handler = None
    _is_handling = False  # 防止递归处理
    _thread_error_count = 0  # 线程错误计数（用于避免重复提示）
    
    @classmethod
    def install(cls):
        """安装全局异常处理器"""
        # 安装 Python 异常处理器
        if cls._original_excepthook is None:
            cls._original_excepthook = sys.excepthook
            sys.excepthook = cls.handle_exception
        
        # 安装 Qt 消息处理器（捕获 QThread 警告）
        if cls._original_qt_handler is None and qInstallMessageHandler is not None:
            try:
                cls._original_qt_handler = qInstallMessageHandler(cls.handle_qt_message)
            except Exception as e:
                logger.warning(f"安装 Qt 消息处理器失败: {e}")
                cls._original_qt_handler = None
    
    @classmethod
    def uninstall(cls):
        """卸载全局异常处理器"""
        if cls._original_excepthook is not None:
            sys.excepthook = cls._original_excepthook
            cls._original_excepthook = None
        
        if cls._original_qt_handler is not None and qInstallMessageHandler is not None:
            try:
                qInstallMessageHandler(cls._original_qt_handler)
            except Exception as e:
                logger.warning(f"卸载 Qt 消息处理器失败: {e}")
            finally:
                cls._original_qt_handler = None
    
    @classmethod
    def handle_exception(cls, exc_type, exc_value, exc_traceback):
        """处理未捕获的异常"""
        # 防止递归处理
        if cls._is_handling:
            if cls._original_excepthook:
                cls._original_excepthook(exc_type, exc_value, exc_traceback)
            return
        
        cls._is_handling = True
        
        try:
            # 记录异常信息
            error_msg = str(exc_value) if exc_value else str(exc_type)
            error_type_name = exc_type.__name__ if exc_type else "UnknownError"
            
            # 记录完整的异常信息到日志
            logger.error(
                f"未捕获的异常: {error_type_name}: {error_msg}",
                exc_info=(exc_type, exc_value, exc_traceback)
            )
            
            # 检查是否是 QThread 相关的错误
            is_thread_error = cls._is_thread_related_error(error_type_name, error_msg)
            
            # 获取 QApplication 实例
            app = QApplication.instance()
            
            if app is not None:
                # 在 GUI 线程中显示错误提示
                cls._show_error_dialog(error_type_name, error_msg, is_thread_error, exc_traceback)
            else:
                # 如果没有 GUI，使用原始异常处理
                if cls._original_excepthook:
                    cls._original_excepthook(exc_type, exc_value, exc_traceback)
                else:
                    # 最后的备选方案：打印到控制台
                    traceback.print_exception(exc_type, exc_value, exc_traceback)
            
        except Exception as e:
            # 如果异常处理本身出错，使用原始处理方式
            logger.error(f"异常处理器本身出错: {e}", exc_info=True)
            if cls._original_excepthook:
                cls._original_excepthook(exc_type, exc_value, exc_traceback)
            else:
                traceback.print_exception(exc_type, exc_value, exc_traceback)
        finally:
            cls._is_handling = False
    
    @classmethod
    def _is_thread_related_error(cls, error_type_name: str, error_msg: str) -> bool:
        """检查是否是线程相关的错误"""
        thread_keywords = [
            "QThread",
            "thread",
            "Thread",
            "Destroyed while thread",
            "thread is still running",
            "worker",
            "Worker"
        ]
        
        error_text = f"{error_type_name} {error_msg}".lower()
        return any(keyword.lower() in error_text for keyword in thread_keywords)
    
    @classmethod
    def _show_error_dialog(cls, error_type_name: str, error_msg: str, is_thread_error: bool, exc_traceback):
        """显示错误对话框"""
        try:
            # 获取主窗口
            app = QApplication.instance()
            main_window = None
            
            # 尝试找到主窗口
            for widget in app.topLevelWidgets():
                if hasattr(widget, 'windowTitle') and 'DataAI' in widget.windowTitle():
                    main_window = widget
                    break
            
            # 如果是线程相关错误，显示友好的提示
            if is_thread_error:
                title = "线程操作错误"
                message = (
                    "检测到线程操作异常，本次操作可能无效。\n\n"
                    f"错误类型: {error_type_name}\n"
                    f"错误信息: {error_msg}\n\n"
                    "这通常是由于线程清理时机不当导致的，不会影响程序的其他功能。\n"
                    "请重试操作，或刷新数据。"
                )
                icon = QMessageBox.Icon.Warning
            else:
                # 其他类型的错误
                title = "程序错误"
                message = (
                    "程序遇到了一个错误：\n\n"
                    f"错误类型: {error_type_name}\n"
                    f"错误信息: {error_msg}\n\n"
                    "详细信息已记录到日志中。"
                )
                icon = QMessageBox.Icon.Critical
            
            # 显示对话框
            msg_box = QMessageBox(icon, title, message, QMessageBox.StandardButton.Ok, main_window)
            msg_box.setWindowModality(Qt.WindowModality.WindowModal)
            
            # 添加详细信息按钮（可选）
            if not is_thread_error:
                detail_button = msg_box.addButton("详细信息", QMessageBox.ButtonRole.ActionRole)
                detail_button.clicked.connect(
                    lambda: cls._show_detail_dialog(error_type_name, error_msg, exc_traceback, main_window)
                )
            
            msg_box.exec()
            
        except Exception as e:
            logger.error(f"显示错误对话框失败: {e}", exc_info=True)
            # 如果显示对话框失败，至少打印到控制台
            print(f"错误: {error_type_name}: {error_msg}")
            traceback.print_exception(type(e), e, e.__traceback__)
    
    @classmethod
    def _show_detail_dialog(cls, error_type_name: str, error_msg: str, exc_traceback, parent=None):
        """显示详细错误信息对话框"""
        try:
            # 获取完整的堆栈跟踪
            if exc_traceback:
                stack_trace = ''.join(traceback.format_exception(
                    type(exc_traceback),
                    exc_traceback,
                    exc_traceback.__traceback__ if hasattr(exc_traceback, '__traceback__') else None
                ))
            else:
                stack_trace = "无堆栈跟踪信息"
            
            detail_msg = (
                f"错误类型: {error_type_name}\n"
                f"错误信息: {error_msg}\n\n"
                f"堆栈跟踪:\n{stack_trace}"
            )
            
            detail_box = QMessageBox(QMessageBox.Icon.Critical, "错误详细信息", detail_msg, 
                                   QMessageBox.StandardButton.Ok, parent)
            detail_box.setWindowModality(Qt.WindowModality.WindowModal)
            detail_box.exec()
        except Exception as e:
            logger.error(f"显示详细错误信息失败: {e}", exc_info=True)
    
    @classmethod
    def handle_qt_message(cls, msg_type, context, message):
        """处理 Qt 消息（包括 QThread 警告）"""
        try:
            # 只处理警告和严重错误
            if msg_type in (QtMsgType.QtWarningMsg, QtMsgType.QtCriticalMsg, QtMsgType.QtFatalMsg):
                message_str = message
                
                # 检查是否是线程相关的警告
                if cls._is_thread_related_error("QtMessage", message_str):
                    # 记录到日志
                    logger.warning(f"Qt 线程警告: {message_str}")
                    
                    # 限制提示频率（避免重复弹窗）
                    cls._thread_error_count += 1
                    if cls._thread_error_count <= 3:  # 最多显示3次提示
                        # 使用 QTimer 延迟显示，避免在消息处理中直接显示对话框
                        from PyQt6.QtCore import QTimer
                        
                        def show_thread_warning():
                            try:
                                app = QApplication.instance()
                                if app is None:
                                    return
                                
                                # 获取主窗口
                                main_window = None
                                for widget in app.topLevelWidgets():
                                    if hasattr(widget, 'windowTitle') and 'DataAI' in widget.windowTitle():
                                        main_window = widget
                                        break
                                
                                msg_box = QMessageBox(
                                    QMessageBox.Icon.Warning,
                                    "线程操作警告",
                                    (
                                        "检测到线程操作异常，本次操作可能无效。\n\n"
                                        f"警告信息: {message_str}\n\n"
                                        "这通常是由于线程清理时机不当导致的，不会影响程序的其他功能。\n"
                                        "请重试操作，或刷新数据。\n\n"
                                        "（此提示最多显示3次）"
                                    ),
                                    QMessageBox.StandardButton.Ok,
                                    main_window
                                )
                                msg_box.setWindowModality(Qt.WindowModality.WindowModal)
                                msg_box.exec()
                            except Exception as e:
                                logger.error(f"显示线程警告对话框失败: {e}", exc_info=True)
                        
                        # 延迟显示，确保不在消息处理回调中直接显示
                        QTimer.singleShot(100, show_thread_warning)
                    else:
                        # 超过3次后，只记录日志，不显示对话框
                        logger.debug(f"线程警告已超过3次，不再显示提示: {message_str}")
                else:
                    # 其他类型的 Qt 警告，使用原始处理器
                    if cls._original_qt_handler:
                        cls._original_qt_handler(msg_type, context, message)
                    else:
                        # 如果没有原始处理器，记录到日志
                        level_map = {
                            QtMsgType.QtWarningMsg: logging.WARNING,
                            QtMsgType.QtCriticalMsg: logging.CRITICAL,
                            QtMsgType.QtFatalMsg: logging.CRITICAL,
                        }
                        log_level = level_map.get(msg_type, logging.WARNING)
                        logger.log(log_level, f"Qt 消息: {message_str}")
            else:
                # 其他类型的消息，使用原始处理器
                if cls._original_qt_handler:
                    cls._original_qt_handler(msg_type, context, message)
        except Exception as e:
            logger.error(f"处理 Qt 消息时出错: {e}", exc_info=True)
            # 如果处理失败，使用原始处理器
            if cls._original_qt_handler:
                try:
                    cls._original_qt_handler(msg_type, context, message)
                except:
                    pass
