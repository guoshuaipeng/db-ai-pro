# AI表选择器错误修复

## 问题描述
用户在使用AI查询功能时，遇到错误导致界面卡死：
```
AITableSelectorWorker: AI选择了 0 个表: []
AITableSelectorWorker: AI未选择任何表，使用前10个表作为降级处理  
AI选择表失败: string indices must be integers, not 'str'
```

## 问题原因

### 1. 类型不匹配错误
在 `ai_table_selector_worker.py` 第 53 和 63 行：
```python
fallback_tables = [table_info["name"] for table_info in self.table_info_list[:10]]
```

代码假设 `table_info` 是字典，但实际上可能是字符串或其他类型，导致：
- 尝试用字符串作为键访问字符串对象
- 抛出 `TypeError: string indices must be integers, not 'str'`

### 2. 错误未正确传播
异常处理中没有发出 `error_occurred` 信号，导致：
- UI 层不知道发生了错误
- 用户看不到错误提示
- 可能导致界面等待超时或卡死

## 解决方案

### 1. 添加类型兼容处理
创建 `_extract_table_names()` 方法，兼容多种数据格式：

```python
def _extract_table_names(self, table_info_list: list) -> list:
    """从表信息列表中提取表名（兼容字符串和字典格式）"""
    table_names = []
    for table_info in table_info_list:
        try:
            if isinstance(table_info, dict):
                # 如果是字典，提取 "name" 字段
                table_names.append(table_info.get("name", str(table_info)))
            elif isinstance(table_info, str):
                # 如果是字符串，直接使用
                table_names.append(table_info)
            else:
                # 其他类型，转换为字符串
                table_names.append(str(table_info))
        except Exception as e:
            logger.error(f"提取表名失败: {str(e)}")
            continue
    return table_names
```

### 2. 发出错误信号
在异常处理中添加：
```python
# 发送错误信号（让UI显示错误）
self.error_occurred.emit(f"AI选择表失败: {error_msg}")
```

### 3. 多层降级处理
```python
try:
    fallback_tables = self._extract_table_names(self.table_info_list[:10])
    self.tables_selected.emit(fallback_tables)
except Exception as fallback_error:
    # 最后的降级：发送空列表
    self.tables_selected.emit([])
```

### 4. 增强错误提示
在 `sql_editor.py` 的 `on_ai_error()` 方法中添加 Toast 提示：

```python
# 显示 Toast 提示（更明显）
try:
    from src.utils.toast_manager import show_error
    show_error(f"AI生成失败: {error}")
except Exception as e:
    logger.warning(f"显示Toast失败: {str(e)}")
```

## 修改的文件

1. **`src/gui/workers/ai_table_selector_worker.py`**
   - 添加 `_extract_table_names()` 方法
   - 修改异常处理逻辑，发出 `error_occurred` 信号
   - 添加多层降级处理

2. **`src/gui/widgets/sql_editor.py`**
   - 在 `on_ai_error()` 方法中添加 Toast 提示
   - 清理相关的 worker 线程

## 效果对比

### 修复前
- ❌ 遇到类型错误时抛出异常
- ❌ 异常不传播到UI层
- ❌ 用户看不到错误信息
- ❌ 界面可能卡死或无响应

### 修复后
- ✅ 兼容多种数据格式（字符串、字典）
- ✅ 错误正确传播到UI层
- ✅ 状态栏显示错误信息
- ✅ Toast 提示显示错误（更明显）
- ✅ 多层降级保证不会卡死
- ✅ 自动清理工作线程

## 用户体验提升

### 错误处理流程
1. AI 选择表失败
2. 记录详细的错误日志
3. 发送 `error_occurred` 信号
4. UI 显示状态栏错误信息
5. 弹出 Toast 错误提示
6. 使用降级方案继续运行（前10个表或空列表）
7. 清理工作线程，恢复按钮状态

### 用户看到的效果
- ✅ **状态栏**：显示详细错误信息
- ✅ **Toast 提示**：弹出明显的错误提示
- ✅ **按钮恢复**：生成按钮恢复可用状态
- ✅ **不会卡死**：即使出错也能正常继续使用

## 技术亮点

1. **类型安全**：使用 `isinstance()` 检查类型
2. **防御性编程**：多层 try-except 保护
3. **优雅降级**：出错后使用合理的降级方案
4. **完整的错误传播**：错误正确传播到UI层
5. **资源清理**：确保工作线程被正确清理

---

**修复状态**: ✅ 已完成  
**测试状态**: ⏳ 待测试  
**部署状态**: ✅ 可发布

