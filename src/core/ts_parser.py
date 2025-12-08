"""
TS 文件解析器
用于在没有 .qm 文件时直接解析 .ts 文件
"""
import xml.etree.ElementTree as ET
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


def parse_ts_file(ts_file: Path) -> dict:
    """
    解析 .ts 文件，返回翻译字典
    
    :param ts_file: .ts 文件路径
    :return: 翻译字典 {context: {source: translation}}
    """
    translations = {}
    
    if not ts_file.exists():
        logger.error(f"TS 文件不存在: {ts_file}")
        return translations
    
    try:
        tree = ET.parse(ts_file)
        root = tree.getroot()
        
        current_context = None
        
        for element in root.iter():
            if element.tag == 'context':
                # 获取上下文名称
                name_elem = element.find('name')
                if name_elem is not None:
                    current_context = name_elem.text
                    if current_context not in translations:
                        translations[current_context] = {}
            
            elif element.tag == 'message' and current_context:
                # 获取源文本和翻译
                source_elem = element.find('source')
                translation_elem = element.find('translation')
                
                if source_elem is not None and translation_elem is not None:
                    source = source_elem.text
                    translation = translation_elem.text
                    
                    # 跳过未翻译的条目（translation 为空或 type='unfinished'）
                    if translation and translation.strip():
                        # 处理 & 符号（菜单快捷键）
                        source = source.replace('&amp;', '&') if source else ''
                        translation = translation.replace('&amp;', '&') if translation else ''
                        
                        if source and translation:
                            translations[current_context][source] = translation
        
        logger.info(f"成功解析 TS 文件: {ts_file}, 共 {sum(len(v) for v in translations.values())} 条翻译")
        return translations
    
    except Exception as e:
        logger.error(f"解析 TS 文件失败: {e}")
        return translations


class TSTranslator:
    """基于 TS 文件的简单翻译器"""
    
    def __init__(self, ts_file: Path):
        self.translations = parse_ts_file(ts_file)
        self.ts_file = ts_file
    
    def translate(self, context: str, source: str) -> str:
        """
        翻译文本
        
        :param context: 上下文（通常是类名）
        :param source: 源文本
        :return: 翻译后的文本，如果找不到则返回源文本
        """
        if context in self.translations:
            if source in self.translations[context]:
                return self.translations[context][source]
        
        # 如果找不到，返回源文本
        return source

