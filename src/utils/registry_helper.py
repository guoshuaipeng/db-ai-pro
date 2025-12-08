"""
Windows注册表辅助工具
用于保存和读取应用设置
"""
import sys
import logging

logger = logging.getLogger(__name__)

# 只在 Windows 上导入 winreg
if sys.platform == "win32":
    try:
        import winreg
        REGISTRY_AVAILABLE = True
    except ImportError:
        REGISTRY_AVAILABLE = False
        logger.warning("无法导入 winreg 模块")
else:
    REGISTRY_AVAILABLE = False


class RegistryHelper:
    """注册表辅助类"""
    
    # 注册表路径：HKEY_CURRENT_USER\Software\DataAI\Settings
    REGISTRY_KEY_PATH = r"Software\DataAI\Settings"
    
    @staticmethod
    def is_available() -> bool:
        """检查注册表功能是否可用"""
        return REGISTRY_AVAILABLE and sys.platform == "win32"
    
    @staticmethod
    def _get_registry_key(access=None):
        """获取注册表键"""
        if not RegistryHelper.is_available():
            return None
        
        if not REGISTRY_AVAILABLE:
            return None
        
        if access is None:
            access = winreg.KEY_READ
        
        try:
            # 打开或创建注册表键
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                RegistryHelper.REGISTRY_KEY_PATH,
                0,
                access
            )
            return key
        except FileNotFoundError:
            # 如果键不存在，尝试创建
            try:
                key = winreg.CreateKey(
                    winreg.HKEY_CURRENT_USER,
                    RegistryHelper.REGISTRY_KEY_PATH
                )
                return key
            except Exception as e:
                logger.error(f"创建注册表键失败: {e}")
                return None
        except Exception as e:
            logger.error(f"打开注册表键失败: {e}")
            return None
    
    @staticmethod
    def get_language() -> str:
        """
        从注册表读取语言设置
        
        :return: 语言代码，如果读取失败则返回默认值 "zh_CN"
        """
        if not RegistryHelper.is_available():
            return "zh_CN"
        
        key = RegistryHelper._get_registry_key(winreg.KEY_READ)
        if key is None:
            return "zh_CN"
        
        try:
            value, _ = winreg.QueryValueEx(key, "Language")
            winreg.CloseKey(key)
            # 验证语言代码是否有效
            if value in ["zh_CN", "en_US"]:
                return value
            else:
                logger.warning(f"注册表中的语言代码无效: {value}，使用默认值")
                return "zh_CN"
        except FileNotFoundError:
            # 键值不存在，返回默认值
            winreg.CloseKey(key)
            return "zh_CN"
        except Exception as e:
            logger.error(f"读取注册表语言设置失败: {e}")
            try:
                winreg.CloseKey(key)
            except:
                pass
            return "zh_CN"
    
    @staticmethod
    def set_language(language: str) -> bool:
        """
        将语言设置保存到注册表
        
        :param language: 语言代码 (zh_CN, en_US)
        :return: 是否保存成功
        """
        if not RegistryHelper.is_available():
            logger.warning("注册表功能不可用，无法保存语言设置")
            return False
        
        # 验证语言代码
        if language not in ["zh_CN", "en_US"]:
            logger.error(f"无效的语言代码: {language}")
            return False
        
        key = RegistryHelper._get_registry_key(winreg.KEY_WRITE)
        if key is None:
            return False
        
        try:
            winreg.SetValueEx(key, "Language", 0, winreg.REG_SZ, language)
            winreg.CloseKey(key)
            logger.info(f"语言设置已保存到注册表: {language}")
            return True
        except Exception as e:
            logger.error(f"保存语言设置到注册表失败: {e}")
            try:
                winreg.CloseKey(key)
            except:
                pass
            return False
    
    @staticmethod
    def delete_language() -> bool:
        """
        从注册表删除语言设置
        
        :return: 是否删除成功
        """
        if not RegistryHelper.is_available():
            return False
        
        key = RegistryHelper._get_registry_key(winreg.KEY_WRITE)
        if key is None:
            return False
        
        try:
            winreg.DeleteValue(key, "Language")
            winreg.CloseKey(key)
            return True
        except FileNotFoundError:
            # 键值不存在，认为删除成功
            winreg.CloseKey(key)
            return True
        except Exception as e:
            logger.error(f"删除注册表语言设置失败: {e}")
            try:
                winreg.CloseKey(key)
            except:
                pass
            return False

