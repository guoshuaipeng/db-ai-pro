"""
统一的线程管理器
用于管理所有 QThread 的生命周期，确保线程正确停止和清理
"""
import logging
from typing import Dict, Optional, Callable
from PyQt6.QtCore import QThread, QTimer, QObject, pyqtSignal, Qt

logger = logging.getLogger(__name__)


class ThreadManager(QObject):
    """统一的线程管理器"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        # 使用 set 存储所有注册的线程，保持强引用，避免线程运行中被 GC
        self._threads: set[QThread] = set()
        # 存储线程的清理回调函数 {thread_id: cleanup_callback}
        self._cleanup_callbacks: Dict[int, Callable] = {}
        # 标记是否正在关闭
        self._is_closing = False
    
    def register_thread(self, thread: QThread, cleanup_callback: Optional[Callable] = None):
        """
        注册一个线程到管理器
        
        Args:
            thread: 要注册的 QThread 对象
            cleanup_callback: 可选的清理回调函数，在线程完全结束后调用
        """
        if thread is None:
            return
        
        thread_id = id(thread)
        # 已注册则只更新清理回调，避免重复连接 finished 信号
        if thread in self._threads:
            if cleanup_callback:
                self._cleanup_callbacks[thread_id] = cleanup_callback
            return

        self._threads.add(thread)
        
        if cleanup_callback:
            self._cleanup_callbacks[thread_id] = cleanup_callback
        
        # 确保线程有名称（如果没有设置，使用默认名称）
        if not thread.objectName():
            thread.setObjectName(f"QThread-{thread_id}")
        
        # 连接 finished 信号，确保线程结束时自动清理
        # 使用 QueuedConnection 确保回调在 UI 线程的事件循环中执行
        # 这样可以在所有信号处理完成后再执行清理操作
        thread.finished.connect(
            lambda: self._on_thread_finished(thread),
            type=Qt.ConnectionType.QueuedConnection
        )
        
        logger.debug(f"注册线程: {thread.objectName()}")
    
    def _on_thread_finished(self, thread: QThread):
        """
        线程结束时的回调
        
        注意：这个方法在 finished 信号触发后，通过 QueuedConnection 在下一个事件循环中执行
        此时线程已经完全结束，所有信号处理也都已完成，可以安全地删除线程对象
        """
        if thread is None:
            return
        
        thread_id = id(thread)
        
        # 执行清理回调（在删除线程之前）
        if thread_id in self._cleanup_callbacks:
            try:
                callback = self._cleanup_callbacks.pop(thread_id)
                callback()
            except Exception as e:
                logger.warning(f"执行线程清理回调失败: {e}")
        
        # 从 WeakSet 中移除（WeakSet 会自动处理）
        if thread in self._threads:
            self._threads.discard(thread)
        
        # 直接调用 deleteLater()，不需要延时
        # 因为：
        # 1. finished 信号已经确保线程完全结束（isRunning() == False）
        # 2. QueuedConnection 确保这个方法在下一个事件循环中执行，此时所有信号处理都已完成
        # 3. Qt 会在 deleteLater() 时自动断开所有信号连接，包括我们连接的 finished 信号
        # 4. 不需要手动断开信号，让 Qt 自动处理，避免警告
        try:
            # 再次检查线程是否还在运行（虽然理论上不应该）
            if thread.isRunning():
                logger.warning(f"尝试删除仍在运行的线程: {thread.objectName() if hasattr(thread, 'objectName') else 'Unknown'}")
                return
            
            thread.deleteLater()
            logger.debug(f"已删除线程: {thread.objectName() if hasattr(thread, 'objectName') else 'Unknown'}")
        except RuntimeError:
            pass  # 对象已被删除，忽略
        except Exception as e:
            logger.warning(f"删除线程时出错: {e}")
    
    def stop_thread(self, thread: QThread, timeout: int = 2000, force: bool = True):
        """
        停止一个线程
        
        Args:
            thread: 要停止的线程
            timeout: 等待超时时间（毫秒）
            force: 如果超时是否强制终止
        
        Returns:
            bool: 是否成功停止
        """
        if thread is None:
            return True
        
        if not thread.isRunning():
            return True
        
        try:
            # 调用线程的 stop 方法（如果存在）
            if hasattr(thread, 'stop'):
                thread.stop()
            
            # 请求中断
            thread.requestInterruption()
            
            # 等待线程结束
            if thread.wait(timeout):
                logger.debug(f"线程已停止: {thread.objectName() if hasattr(thread, 'objectName') else 'Unknown'}")
                return True
            else:
                if force:
                    logger.warning(f"线程未能在 {timeout}ms 内停止，强制终止: {thread.objectName() if hasattr(thread, 'objectName') else 'Unknown'}")
                    thread.terminate()
                    thread.wait(500)  # 等待终止完成
                    return True
                else:
                    logger.warning(f"线程未能在 {timeout}ms 内停止: {thread.objectName() if hasattr(thread, 'objectName') else 'Unknown'}")
                    return False
        except RuntimeError:
            # 对象已被删除
            return True
        except Exception as e:
            logger.warning(f"停止线程时出错: {e}")
            return False
    
    def stop_all_threads(self, timeout: int = 2000):
        """停止所有注册的线程"""
        self._is_closing = True
        
        # 创建线程列表的副本，因为 WeakSet 在迭代时可能会变化
        threads_to_stop = list(self._threads)
        
        logger.info(f"开始停止 {len(threads_to_stop)} 个线程...")
        
        for thread in threads_to_stop:
            if thread is not None:
                self.stop_thread(thread, timeout=timeout, force=True)
        
        # 清空清理回调
        self._cleanup_callbacks.clear()
        
        logger.info("所有线程已停止")
    
    def cleanup(self):
        """清理管理器（在应用关闭时调用）"""
        self.stop_all_threads()
    
    def get_thread_count(self) -> int:
        """获取当前注册的线程数量"""
        return len(self._threads)


# 全局线程管理器实例
_global_thread_manager: Optional[ThreadManager] = None


def get_thread_manager() -> ThreadManager:
    """获取全局线程管理器实例"""
    global _global_thread_manager
    if _global_thread_manager is None:
        _global_thread_manager = ThreadManager()
    return _global_thread_manager


def set_thread_manager(manager: ThreadManager):
    """设置全局线程管理器实例（主要用于测试）"""
    global _global_thread_manager
    _global_thread_manager = manager


def safe_delete_thread(thread: QThread, cleanup_callback: Optional[Callable] = None):
    """
    安全删除线程对象的辅助函数
    
    这个函数会自动处理线程的清理：
    1. 如果线程还在运行，会连接 finished 信号到 deleteLater()
    2. 如果线程已经结束，直接调用 deleteLater()
    3. 使用 QueuedConnection 确保在事件循环中执行，不需要延时
    
    Args:
        thread: 要删除的 QThread 对象
        cleanup_callback: 可选的清理回调函数，在线程完全结束后调用
    """
    if thread is None:
        return
    
    # 如果线程还在运行，连接 finished 信号到删除操作
    if thread.isRunning():
        # 如果有清理回调，先执行它
        if cleanup_callback:
            def on_finished():
                try:
                    cleanup_callback()
                except Exception as e:
                    logger.warning(f"执行清理回调失败: {e}")
                # 使用 QueuedConnection 确保在所有信号处理完成后再删除
                thread.deleteLater()
            
            thread.finished.connect(
                on_finished,
                type=Qt.ConnectionType.QueuedConnection
            )
        else:
            # 直接连接 finished 信号到 deleteLater()，使用 QueuedConnection
            # 这样不需要延时，因为 QueuedConnection 确保在下一个事件循环中执行
            thread.finished.connect(
                thread.deleteLater,
                type=Qt.ConnectionType.QueuedConnection
            )
    else:
        # 线程已经结束，直接删除
        if cleanup_callback:
            try:
                cleanup_callback()
            except Exception as e:
                logger.warning(f"执行清理回调失败: {e}")
        thread.deleteLater()
