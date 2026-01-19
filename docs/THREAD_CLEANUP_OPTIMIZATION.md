# 线程清理优化：移除不必要的延时

## 问题描述

之前的代码中，在清理 QThread 对象时使用了 `QTimer.singleShot(200, ...)` 来延迟删除线程对象，目的是确保所有信号处理完成后再删除。这种方式存在以下问题：

1. **不够优雅**：使用固定的延时时间（200ms）是权宜之计，不是根本解决方案
2. **仍然可能出现警告**：即使延时，仍然可能出现 "QThread: Destroyed while thread is still running" 警告
3. **代码重复**：在多处地方重复使用相同的延时删除模式

## 解决方案

### 核心思路

使用 Qt 的信号槽机制和 `QueuedConnection` 来确保线程对象在正确的时机被删除：

1. **finished 信号**：当线程完全结束时，Qt 会发出 `finished` 信号
2. **QueuedConnection**：使用 `QueuedConnection` 连接 `finished` 信号到 `deleteLater()`，确保删除操作在下一个事件循环中执行
3. **自动清理**：Qt 会在 `deleteLater()` 时自动断开所有信号连接，不需要手动断开

### 实现方式

#### 1. 优化 ThreadManager

修改 `_on_thread_finished` 方法，移除延时，直接调用 `deleteLater()`：

```python
def _on_thread_finished(self, thread: QThread):
    """
    线程结束时的回调
    
    注意：这个方法在 finished 信号触发后，通过 QueuedConnection 在下一个事件循环中执行
    此时线程已经完全结束，所有信号处理也都已完成，可以安全地删除线程对象
    """
    # ... 执行清理回调 ...
    
    # 直接调用 deleteLater()，不需要延时
    # 因为：
    # 1. finished 信号已经确保线程完全结束（isRunning() == False）
    # 2. QueuedConnection 确保这个方法在下一个事件循环中执行，此时所有信号处理都已完成
    # 3. Qt 会在 deleteLater() 时自动断开所有信号连接
    thread.deleteLater()
```

#### 2. 创建统一的辅助函数

创建 `safe_delete_thread` 函数，统一处理线程清理：

```python
def safe_delete_thread(thread: QThread, cleanup_callback: Optional[Callable] = None):
    """
    安全删除线程对象的辅助函数
    
    这个函数会自动处理线程的清理：
    1. 如果线程还在运行，会连接 finished 信号到 deleteLater()
    2. 如果线程已经结束，直接调用 deleteLater()
    3. 使用 QueuedConnection 确保在事件循环中执行，不需要延时
    """
    if thread is None:
        return
    
    if thread.isRunning():
        # 连接 finished 信号到 deleteLater()，使用 QueuedConnection
        thread.finished.connect(
            thread.deleteLater,
            type=Qt.ConnectionType.QueuedConnection
        )
    else:
        # 线程已经结束，直接删除
        thread.deleteLater()
```

#### 3. 替换所有延时删除的代码

将所有使用 `QTimer.singleShot(200, worker.deleteLater)` 的地方替换为 `safe_delete_thread(worker)`：

**之前**：
```python
# 断开信号连接
try:
    worker.query_finished.disconnect()
    worker.query_progress.disconnect()
except:
    pass
# 延迟删除，确保所有信号处理完成
QTimer.singleShot(200, worker.deleteLater)
```

**之后**：
```python
# 使用 safe_delete_thread，自动处理线程清理
from src.utils.thread_manager import safe_delete_thread
safe_delete_thread(worker)
```

## 优势

1. **不需要延时**：利用 Qt 的信号槽机制和事件循环，确保在正确的时机删除对象
2. **更可靠**：`QueuedConnection` 确保删除操作在所有信号处理完成后执行
3. **代码更简洁**：不需要手动断开信号，不需要延时，Qt 自动处理
4. **统一管理**：所有线程清理都通过统一的函数处理，便于维护
5. **避免警告**：正确使用 Qt 的机制，避免 "QThread: Destroyed while thread is still running" 警告

## 修改的文件

1. `src/utils/thread_manager.py` - 优化线程管理器，移除延时
2. `src/gui/handlers/query_handler.py` - 使用新的清理方式
3. `src/gui/main_window.py` - 使用新的清理方式
4. `src/gui/widgets/floating_result_window.py` - 使用新的清理方式
5. `src/gui/dialogs/schema_sync_dialog.py` - 使用新的清理方式

## 技术细节

### QueuedConnection 的工作原理

1. 当线程发出 `finished` 信号时，Qt 会将信号放入事件队列
2. 在下一个事件循环中，Qt 会处理这个信号
3. 此时，所有与 `finished` 信号相关的槽函数都已经执行完成
4. 因此，在 `QueuedConnection` 的槽函数中调用 `deleteLater()` 是安全的

### 为什么不需要手动断开信号

Qt 的 `deleteLater()` 机制会在对象被删除时自动断开所有信号连接。手动断开信号不仅不必要，还可能导致警告（"wildcard call disconnects from destroyed signal"）。

### 为什么不需要延时

- `finished` 信号已经确保线程完全结束
- `QueuedConnection` 确保删除操作在下一个事件循环中执行
- 此时所有信号处理都已完成，可以安全删除

## 测试建议

1. 运行应用，执行各种数据库操作
2. 检查日志，确认没有 "QThread: Destroyed while thread is still running" 警告
3. 测试快速连续操作，确保线程清理正常
4. 测试应用关闭时的线程清理

## 总结

通过使用 Qt 的信号槽机制和 `QueuedConnection`，我们完全移除了不必要的延时，使代码更加优雅和可靠。这种方式不仅解决了警告问题，还提高了代码的可维护性。
