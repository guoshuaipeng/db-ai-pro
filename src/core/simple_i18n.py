"""
简单的国际化系统
不依赖 Qt 的 .qm 文件，直接使用 Python 字典
"""
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)


class SimpleI18n:
    """简单的国际化翻译系统"""
    
    def __init__(self):
        self.translations: Dict[str, Dict[str, str]] = {}
        self.current_language = "zh_CN"
        self.fallback_language = "zh_CN"
    
    def load_from_ts(self, ts_file) -> bool:
        """
        从 .ts 文件加载翻译
        
        :param ts_file: .ts 文件路径（Path 或 str）
        :return: 是否加载成功
        """
        ts_file = Path(ts_file)
        if not ts_file.exists():
            logger.error(f"TS 文件不存在: {ts_file}")
            return False
        
        try:
            tree = ET.parse(ts_file)
            root = tree.getroot()
            
            translations = {}
            
            for context in root.findall('context'):
                context_name = context.find('name')
                if context_name is None:
                    continue
                
                context_name = context_name.text
                if context_name not in translations:
                    translations[context_name] = {}
                
                for message in context.findall('message'):
                    source = message.find('source')
                    translation = message.find('translation')
                    
                    if source is not None and translation is not None:
                        source_text = source.text or ""
                        trans_text = translation.text or ""
                        
                        # 跳过未翻译的
                        if trans_text.strip():
                            translations[context_name][source_text] = trans_text
            
            self.translations = translations
            logger.info(f"成功加载翻译: {ts_file}, 共 {sum(len(v) for v in translations.values())} 条")
            return True
        
        except Exception as e:
            logger.error(f"加载 TS 文件失败: {e}")
            return False
    
    def load_from_json(self, json_file) -> bool:
        """
        从 JSON 文件加载翻译
        
        :param json_file: JSON 文件路径（Path 或 str）
        :return: 是否加载成功
        """
        json_file = Path(json_file)
        if not json_file.exists():
            return False
        
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                self.translations = json.load(f)
            logger.info(f"成功加载 JSON 翻译文件: {json_file}")
            return True
        except Exception as e:
            logger.error(f"加载 JSON 文件失败: {e}")
            return False
    
    def translate(self, context: str, source: str) -> str:
        """
        翻译文本
        
        :param context: 上下文（类名，如 "MainWindow"）
        :param source: 源文本
        :return: 翻译后的文本
        """
        # 如果是默认语言，直接返回源文本
        if self.current_language == self.fallback_language:
            return source
        
        # 查找翻译
        if context in self.translations:
            if source in self.translations[context]:
                return self.translations[context][source]
        
        # 如果找不到，返回源文本
        return source
    
    def set_language(self, language: str):
        """设置当前语言"""
        self.current_language = language
    
    def get_language(self) -> str:
        """获取当前语言"""
        return self.current_language


# 全局翻译器实例
_global_i18n = SimpleI18n()


def get_i18n() -> SimpleI18n:
    """获取全局翻译器"""
    return _global_i18n


def tr(context: str, source: str) -> str:
    """
    翻译函数（替代 PyQt6 的 tr）
    
    :param context: 上下文
    :param source: 源文本
    :return: 翻译后的文本
    """
    return _global_i18n.translate(context, source)

