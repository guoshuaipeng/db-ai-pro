"""
数据库连接模型
"""
from pydantic import BaseModel, Field, SecretStr
from typing import Optional, Literal
from enum import Enum


class DatabaseType(str, Enum):
    """数据库类型枚举"""
    MYSQL = "mysql"
    POSTGRESQL = "postgresql"
    SQLITE = "sqlite"
    ORACLE = "oracle"
    SQLSERVER = "sqlserver"
    MARIADB = "mariadb"
    HIVE = "hive"


class DatabaseConnection(BaseModel):
    """数据库连接配置"""
    id: Optional[str] = None
    name: str = Field(..., description="连接名称")
    db_type: DatabaseType = Field(..., description="数据库类型")
    
    # 连接信息
    host: str = Field(..., description="主机地址")
    port: int = Field(..., description="端口号")
    database: str = Field(..., description="数据库名")
    username: str = Field(..., description="用户名")
    password: SecretStr = Field(..., description="密码")
    
    # 可选配置
    charset: str = Field(default="utf8mb4", description="字符集")
    timeout: int = Field(default=30, description="连接超时（秒）")
    use_ssl: bool = Field(default=False, description="使用SSL")
    
    # 连接状态
    is_active: bool = Field(default=True, description="是否激活")
    
    class Config:
        """Pydantic配置"""
        from_attributes = True
        json_encoders = {
            SecretStr: lambda v: v.get_secret_value() if v else None
        }
    
    def get_connection_string(self) -> str:
        """获取SQLAlchemy连接字符串"""
        from urllib.parse import quote_plus
        
        password = self.password.get_secret_value()
        
        db_type_map = {
            DatabaseType.MYSQL: "mysql+pymysql",
            DatabaseType.MARIADB: "mysql+pymysql",
            DatabaseType.POSTGRESQL: "postgresql+psycopg2",
            DatabaseType.SQLITE: "sqlite",
            DatabaseType.ORACLE: "oracle+oracledb",
            DatabaseType.SQLSERVER: "mssql+pyodbc",
            DatabaseType.HIVE: "hive",
        }
        
        driver = db_type_map.get(self.db_type, "mysql+pymysql")
        
        if self.db_type == DatabaseType.SQLITE:
            return f"{driver}:///{self.database}"
        
        # URL编码用户名和密码（处理特殊字符如 @, :, / 等）
        encoded_username = quote_plus(self.username)
        encoded_password = quote_plus(password)
        
        connection_string = (
            f"{driver}://{encoded_username}:{encoded_password}@"
            f"{self.host}:{self.port}/{self.database}"
        )
        
        # 添加URL参数（只添加URL支持的参数）
        params = []
        if self.charset and self.db_type in [DatabaseType.MYSQL, DatabaseType.MARIADB]:
            params.append(f"charset={self.charset}")
        
        if params:
            connection_string += "?" + "&".join(params)
        
        return connection_string
    
    def get_connect_args(self) -> dict:
        """获取连接参数（用于 connect_args）"""
        connect_args = {}
        
        if self.db_type in [DatabaseType.MYSQL, DatabaseType.MARIADB]:
            # pymysql 连接参数
            # 注意：pymysql 不支持 allow_public_key_retrieval 参数（这是 JDBC 特有的）
            # pymysql 会自动处理公钥检索，不需要显式设置
            
            # SSL 设置
            if not self.use_ssl:
                # pymysql 中，ssl=False 表示禁用 SSL
                connect_args['ssl'] = False
            # 如果 use_ssl=True，不设置 ssl 参数，使用默认值
            
            # 超时设置
            connect_args['connect_timeout'] = self.timeout
            connect_args['read_timeout'] = self.timeout
            connect_args['write_timeout'] = self.timeout
        elif self.db_type == DatabaseType.ORACLE:
            # Oracle (oracledb) 连接参数
            # 设置连接超时，避免长时间等待导致UI卡死
            # oracledb 使用 connect_timeout 参数（单位：秒）
            connect_args['connect_timeout'] = self.timeout
        elif self.db_type == DatabaseType.POSTGRESQL:
            # PostgreSQL (psycopg2) 连接参数
            connect_args['connect_timeout'] = self.timeout
        elif self.db_type == DatabaseType.SQLSERVER:
            # SQL Server (pyodbc) 连接参数
            connect_args['timeout'] = self.timeout
        elif self.db_type == DatabaseType.HIVE:
            # Hive (pyhive) 连接参数
            # Hive 使用 auth_mechanism 参数，默认为 'PLAIN'
            # 如果需要 Kerberos 认证，可以设置 auth_mechanism='KERBEROS'
            connect_args['auth_mechanism'] = 'PLAIN'
            # 超时设置
            connect_args['timeout'] = self.timeout
        
        return connect_args
    
    def get_display_name(self) -> str:
        """获取显示名称"""
        return f"{self.name} ({self.db_type.value}://{self.host}:{self.port}/{self.database})"

