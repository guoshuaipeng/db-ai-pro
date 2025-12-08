"""
简单的翻译系统
直接解析 .ts 文件并提供翻译功能
"""
import xml.etree.ElementTree as ET
from pathlib import Path
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class SimpleTranslator:
    """简单的翻译器，直接解析 .ts 文件"""
    
    def __init__(self):
        self.translations: Dict[str, Dict[str, str]] = {}
        self.current_language = "zh_CN"
        self.ts_file: Optional[Path] = None
    
    def load_from_ts(self, ts_file: Path) -> bool:
        """
        从 .ts 文件加载翻译
        
        :param ts_file: .ts 文件路径
        :return: 是否加载成功
        """
        if not ts_file.exists():
            logger.error(f"TS 文件不存在: {ts_file}")
            return False
        
        try:
            tree = ET.parse(ts_file)
            root = tree.getroot()
            
            current_context = None
            translations = {}
            
            for element in root.iter():
                if element.tag == 'context':
                    name_elem = element.find('name')
                    if name_elem is not None:
                        current_context = name_elem.text
                        if current_context not in translations:
                            translations[current_context] = {}
                
                elif element.tag == 'message' and current_context:
                    source_elem = element.find('source')
                    translation_elem = element.find('translation')
                    
                    if source_elem is not None and translation_elem is not None:
                        source = source_elem.text or ""
                        translation = translation_elem.text or ""
                        
                        # 跳过未翻译的条目
                        if translation and translation.strip():
                            # 处理 & 符号（菜单快捷键）
                            source = source.replace('&amp;', '&')
                            translation = translation.replace('&amp;', '&')
                            
                            if source and translation:
                                translations[current_context][source] = translation
            
            self.translations = translations
            self.ts_file = ts_file
            count = sum(len(v) for v in translations.values())
            logger.info(f"成功加载翻译: {ts_file}, 共 {count} 条")
            return True
        
        except Exception as e:
            logger.error(f"解析 TS 文件失败: {e}")
            return False
    
    def translate(self, context: str, source: str) -> str:
        """
        翻译文本
        
        :param context: 上下文（通常是类名，如 "MainWindow"）
        :param source: 源文本
        :return: 翻译后的文本，如果找不到则返回源文本
        """
        if self.current_language == "zh_CN":
            return source  # 中文是默认语言，不需要翻译
        
        if context in self.translations:
            if source in self.translations[context]:
                return self.translations[context][source]
        
        # 如果找不到，返回源文本
        return source
    
    def set_language(self, language: str):
        """设置当前语言"""
        self.current_language = language


# 全局翻译器实例
_global_translator = SimpleTranslator()


def get_translator() -> SimpleTranslator:
    """获取全局翻译器"""
    return _global_translator


def tr(context: str, source: str) -> str:
    """
    翻译函数（替代 PyQt6 的 tr）
    
    :param context: 上下文
    :param source: 源文本
    :return: 翻译后的文本
    """
    return _global_translator.translate(context, source)

