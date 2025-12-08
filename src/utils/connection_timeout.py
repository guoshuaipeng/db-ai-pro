"""
数据库连接超时工具
用于强制限制数据库连接的超时时间，避免长时间阻塞
"""
import socket
import logging
from contextlib import contextmanager
from typing import Optional, Callable, Any
import threading
import time

logger = logging.getLogger(__name__)


def set_socket_timeout(timeout: float):
    """设置全局socket默认超时（作为额外保护）"""
    socket.setdefaulttimeout(timeout)
    logger.debug(f"设置socket默认超时: {timeout}秒")


@contextmanager
def timeout_context(timeout: float, timeout_message: str = "操作超时"):
    """
    超时上下文管理器，强制在指定时间内完成操作
    
    Args:
        timeout: 超时时间（秒）
        timeout_message: 超时时的错误消息
    """
    result = [None]
    exception = [None]
    done = threading.Event()
    
    def target():
        try:
            # 这里会在外部调用时设置result
            pass
        except Exception as e:
            exception[0] = e
        finally:
            done.set()
    
    start_time = time.time()
    
    # 设置socket默认超时作为额外保护
    old_timeout = socket.getdefaulttimeout()
    try:
        socket.setdefaulttimeout(timeout)
        yield result
    except socket.timeout as e:
        elapsed = time.time() - start_time
        logger.error(f"Socket超时: {timeout_message}，耗时: {elapsed:.3f}秒")
        raise TimeoutError(f"{timeout_message}（{timeout}秒）") from e
    finally:
        socket.setdefaulttimeout(old_timeout)
        if exception[0]:
            raise exception[0]


def connect_with_timeout(connect_func: Callable, timeout: float, timeout_message: str = "连接超时"):
    """
    在指定超时时间内执行连接操作
    
    Args:
        connect_func: 连接函数（无参数）
        timeout: 超时时间（秒）
        timeout_message: 超时时的错误消息
    
    Returns:
        连接函数的结果
    
    Raises:
        TimeoutError: 如果操作超时
    """
    result = [None]
    exception = [None]
    done = threading.Event()
    
    def run_connect():
        try:
            result[0] = connect_func()
        except Exception as e:
            exception[0] = e
        finally:
            done.set()
    
    start_time = time.time()
    
    # 在单独的线程中运行连接操作
    thread = threading.Thread(target=run_connect, daemon=True)
    thread.start()
    
    # 等待连接完成或超时
    if done.wait(timeout):
        elapsed = time.time() - start_time
        if exception[0]:
            logger.error(f"连接失败，耗时: {elapsed:.3f}秒，错误: {exception[0]}")
            raise exception[0]
        logger.info(f"连接成功，耗时: {elapsed:.3f}秒")
        return result[0]
    else:
        elapsed = time.time() - start_time
        logger.error(f"连接超时: {timeout_message}，耗时: {elapsed:.3f}秒")
        raise TimeoutError(f"{timeout_message}（{timeout}秒）")

