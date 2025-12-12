"""
AI模型配置
"""
from pydantic import BaseModel, SecretStr
from typing import Optional
from enum import Enum
import uuid


class AIModelProvider(str, Enum):
    """AI模型提供商"""
    ALIYUN_QIANWEN = "aliyun_qianwen"  # 阿里云通义千问
    OPENAI = "openai"  # OpenAI
    DEEPSEEK = "deepseek"  # DeepSeek
    ZHIPU_GLM = "zhipu_glm"  # 智谱AI (GLM)
    BAIDU_WENXIN = "baidu_wenxin"  # 百度文心一言
    XUNFEI_XINGHUO = "xunfei_xinghuo"  # 讯飞星火
    MOONSHOT = "moonshot"  # Moonshot (月之暗面/Kimi)
    TENCENT_HUNYUAN = "tencent_hunyuan"  # 腾讯混元
    ANTHROPIC_CLAUDE = "anthropic_claude"  # Anthropic Claude
    GOOGLE_GEMINI = "google_gemini"  # Google Gemini
    CUSTOM = "custom"  # 自定义/其他兼容OpenAI接口的模型


class AIModelConfig(BaseModel):
    """AI模型配置"""
    id: str  # 配置ID
    name: str  # 配置名称
    provider: AIModelProvider  # 提供商
    api_key: SecretStr  # API密钥（加密存储）
    base_url: Optional[str] = None  # API基础URL（可选，某些提供商需要）
    default_model: str = "qwen-plus"  # 默认模型名称
    turbo_model: str = "qwen-turbo"  # Turbo模型名称（用于快速操作）
    is_active: bool = True  # 是否激活
    # is_default 字段已废弃，不再使用
    
    def get_base_url(self) -> str:
        """获取API基础URL"""
        if self.base_url:
            return self.base_url
        
        # 根据提供商返回默认URL
        url_map = {
            AIModelProvider.ALIYUN_QIANWEN: "https://dashscope.aliyuncs.com/compatible-mode/v1",
            AIModelProvider.OPENAI: "https://api.openai.com/v1",
            AIModelProvider.DEEPSEEK: "https://api.deepseek.com/v1",
            AIModelProvider.ZHIPU_GLM: "https://open.bigmodel.cn/api/paas/v4",
            AIModelProvider.BAIDU_WENXIN: "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop",
            AIModelProvider.XUNFEI_XINGHUO: "https://spark-api-open.xf-yun.com/v1",
            AIModelProvider.MOONSHOT: "https://api.moonshot.cn/v1",
            AIModelProvider.TENCENT_HUNYUAN: "https://api.hunyuan.cloud.tencent.com/v1",
            AIModelProvider.ANTHROPIC_CLAUDE: "https://api.anthropic.com/v1",
            AIModelProvider.GOOGLE_GEMINI: "https://generativelanguage.googleapis.com/v1",
            AIModelProvider.CUSTOM: "https://api.openai.com/v1",  # 默认兼容OpenAI接口
        }
        
        return url_map.get(self.provider, "https://api.openai.com/v1")

