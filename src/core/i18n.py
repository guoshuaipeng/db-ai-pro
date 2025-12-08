"""
国际化翻译系统
"""
from PyQt6.QtCore import QTranslator, QLocale, QLibraryInfo
from PyQt6.QtWidgets import QApplication
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# 导入简单翻译系统（不依赖 .qm 文件）
try:
    from src.core.simple_i18n import SimpleI18n, get_i18n
    SIMPLE_I18N_AVAILABLE = True
except ImportError:
    SIMPLE_I18N_AVAILABLE = False
    logger.warning("简单翻译系统不可用")


class TranslationManager:
    """翻译管理器"""
    
    def __init__(self, app: QApplication):
        self.app = app
        self.translator = QTranslator()
        self.simple_i18n = None  # 简单翻译系统（不依赖 .qm）
        self.current_language = "zh_CN"
        
    def get_translations_dir(self) -> Path:
        """获取翻译文件目录"""
        project_root = Path(__file__).parent.parent.parent
        translations_dir = project_root / "resources" / "translations"
        translations_dir.mkdir(parents=True, exist_ok=True)
        return translations_dir
    
    def load_translation(self, language: str) -> bool:
        """
        加载翻译文件
        
        :param language: 语言代码 (zh_CN, en_US)
        :return: 是否加载成功
        """
        # 移除旧的翻译器
        if self.translator:
            self.app.removeTranslator(self.translator)
            self.translator = None
        
        # 如果语言是默认语言（中文），不需要加载翻译文件
        if language == "zh_CN":
            self.current_language = language
            logger.info("使用默认语言: 中文")
            return True
        
        # 创建新的翻译器
        self.translator = QTranslator()
        translations_dir = self.get_translations_dir()
        
        # 优先尝试加载 .qm 文件
        translation_file_qm = translations_dir / f"dataai_{language}.qm"
        translation_file_ts = translations_dir / f"dataai_{language}.ts"
        
        # 尝试加载 .qm 文件
        if translation_file_qm.exists():
            if self.translator.load(str(translation_file_qm)):
                self.app.installTranslator(self.translator)
                self.current_language = language
                logger.info(f"已加载翻译文件: {translation_file_qm}")
                return True
            else:
                logger.warning(f"加载 .qm 文件失败: {translation_file_qm}")
        
        # 注意：PyQt6 的 QTranslator 不支持直接加载 .ts 文件
        # 需要先编译为 .qm 文件才能使用
        if translation_file_ts.exists() and not translation_file_qm.exists():
            logger.warning(f"⚠️  .qm 文件不存在: {translation_file_qm}")
            logger.warning(f"   但找到了 .ts 文件: {translation_file_ts}")
            logger.warning("   请运行以下命令生成 .qm 文件:")
            logger.warning(f"   lrelease {translation_file_ts} -qm {translation_file_qm}")
            logger.warning("   或参考 resources/translations/HOW_TO_GENERATE_QM.md")
        
        # 如果都失败，使用简单翻译系统（不依赖 .qm 文件）
        if SIMPLE_I18N_AVAILABLE:
            try:
                from src.core.simple_i18n import SimpleI18n, get_i18n
                self.simple_i18n = SimpleI18n()
                
                # 优先尝试加载 JSON 文件
                translation_file_json = translations_dir / f"dataai_{language}.json"
                if translation_file_json.exists():
                    if self.simple_i18n.load_from_json(translation_file_json):
                        self.simple_i18n.set_language(language)
                        # 更新全局翻译器
                        global_i18n = get_i18n()
                        global_i18n.translations = self.simple_i18n.translations
                        global_i18n.current_language = language
                        self.current_language = language
                        logger.info(f"✓ 使用 JSON 翻译文件: {translation_file_json}")
                        logger.info("✓ 翻译系统已就绪，无需 .qm 文件")
                        return True
                
                # 如果 JSON 不存在，尝试加载 TS 文件
                if translation_file_ts.exists():
                    if self.simple_i18n.load_from_ts(translation_file_ts):
                        self.simple_i18n.set_language(language)
                        # 更新全局翻译器
                        global_i18n = get_i18n()
                        global_i18n.translations = self.simple_i18n.translations
                        global_i18n.current_language = language
                        self.current_language = language
                        logger.info(f"✓ 使用 TS 翻译文件: {translation_file_ts}")
                        logger.info("✓ 翻译系统已就绪，无需 .qm 文件")
                        return True
            except Exception as e:
                logger.error(f"使用简单翻译系统失败: {e}")
        
        # 如果都失败
        logger.error(f"翻译文件不存在或加载失败:")
        logger.error(f"  - {translation_file_qm}")
        logger.error(f"  - {translation_file_ts}")
        logger.error("请运行 scripts/generate_translations.py 生成 .qm 文件")
        self.current_language = "zh_CN"  # 回退到默认语言
        return False
    
    def get_available_languages(self) -> dict:
        """获取可用的语言列表"""
        return {
            "zh_CN": "中文",
            "en_US": "English"
        }
    
    def get_current_language(self) -> str:
        """获取当前语言"""
        return self.current_language

