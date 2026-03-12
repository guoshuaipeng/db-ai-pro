"""
AI诊断工作线程 - 使用AI分析数据库进程和健康状态
"""
from PyQt6.QtCore import QThread, pyqtSignal
from typing import List, Dict
import logging
import json

logger = logging.getLogger(__name__)


class AIDiagnosisWorker(QThread):
    """AI诊断工作线程"""
    
    diagnosis_ready = pyqtSignal(str)  # 诊断结果
    error_occurred = pyqtSignal(str)  # 错误信息
    
    def __init__(self, ai_client, processes: List[Dict], health_data: Dict, db_type: str, database: str = None):
        super().__init__()
        self.setObjectName(f"AIDiagnosisWorker-{id(self)}")
        self.ai_client = ai_client
        self.processes = processes
        self.health_data = health_data
        self.db_type = db_type
        self.database = database
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """执行AI诊断（在工作线程中运行）"""
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 构建提示词
            prompt = self._build_diagnosis_prompt()
            
            response = self.ai_client.chat_complete(
                messages=[
                    {"role": "system", "content": self._get_system_prompt()},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                caller="ai_diagnosis",
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            diagnosis_result = response.choices[0].message.content.strip()
            
            # 发送结果
            self.diagnosis_ready.emit(diagnosis_result)
            
        except Exception as e:
            error_msg = f"AI诊断失败: {str(e)}"
            logger.error(error_msg, exc_info=True)
            if not (self.isInterruptionRequested() or self._should_stop):
                self.error_occurred.emit(error_msg)
        finally:            # 注意：QThread 的 run() 方法返回时，线程会自动结束，finished 信号会自动触发
            # 不需要调用 quit()，因为 QThread.run() 默认没有事件循环
            pass
    
    def _get_system_prompt(self) -> str:
        """获取系统提示词"""
        return """你是一个专业的数据库性能分析专家。你的任务是分析数据库进程列表和健康状态数据，识别潜在问题并提供解决方案。

请按照以下格式输出分析结果：

## 数据库健康状态分析

### 1. 连接状态
- 当前连接数: X / Y (使用率: Z%)
- 状态: [正常/警告/危险]

### 2. 性能指标
- 慢查询数量: X
- 锁等待情况: [描述]
- 其他指标: [描述]

### 3. 问题进程识别
列出有问题的进程（长时间运行、锁等待等）：
- 进程ID: X, 用户: Y, 运行时间: Z秒, 问题: [描述], 建议: [解决方案]

### 4. 慢SQL分析
如果发现慢SQL，分析原因：
- SQL: [SQL语句]
- 问题: [分析]
- 建议: [优化建议]

### 5. 总体建议
提供数据库优化建议和问题解决方案。

请用中文回答，分析要专业、准确、实用。"""
    
    def _build_diagnosis_prompt(self) -> str:
        """构建诊断提示词"""
        prompt_parts = []
        
        prompt_parts.append(f"请分析以下{self.db_type}数据库的进程列表和健康状态：")
        
        if self.database:
            prompt_parts.append(f"\n目标数据库: {self.database}")
        
        # 添加健康数据
        if self.health_data:
            prompt_parts.append("\n## 数据库健康状态数据:")
            prompt_parts.append(json.dumps(self.health_data, ensure_ascii=False, indent=2))
        
        # 添加进程列表
        if self.processes:
            prompt_parts.append(f"\n## 进程列表 (共 {len(self.processes)} 个进程):")
            
            # 只发送关键信息，避免token过多
            process_summary = []
            for i, proc in enumerate(self.processes[:50]):  # 最多50个进程
                proc_info = {
                    "Id": proc.get('Id') or proc.get('id') or proc.get('PID'),
                    "User": proc.get('User') or proc.get('user') or proc.get('usename'),
                    "Host": proc.get('Host') or proc.get('host'),
                    "db": proc.get('db') or proc.get('database') or proc.get('datname'),
                    "Command": proc.get('Command') or proc.get('command') or proc.get('state'),
                    "Time": proc.get('Time') or proc.get('time'),
                    "State": proc.get('State') or proc.get('state') or proc.get('Info')
                }
                process_summary.append(proc_info)
            
            prompt_parts.append(json.dumps(process_summary, ensure_ascii=False, indent=2))
            
            if len(self.processes) > 50:
                prompt_parts.append(f"\n注意: 只显示了前50个进程，总共有{len(self.processes)}个进程。")
        
        prompt_parts.append("\n请分析以上数据，识别潜在问题（如慢SQL、锁等待、连接数过多等），并提供具体的解决方案。")
        
        return "\n".join(prompt_parts)
