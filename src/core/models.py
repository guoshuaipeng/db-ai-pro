"""
数据模型
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class BaseDataModel(BaseModel):
    """基础数据模型"""
    id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        """Pydantic配置"""
        from_attributes = True


