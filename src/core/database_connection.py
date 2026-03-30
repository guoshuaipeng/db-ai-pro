"""
数据库连接模型
"""
import logging
import os
import threading

from pydantic import BaseModel, Field, SecretStr
from typing import Optional, Dict, Any
from enum import Enum


logger = logging.getLogger(__name__)


class DatabaseType(str, Enum):
    """数据库类型枚举"""
    MYSQL = "mysql"
    POSTGRESQL = "postgresql"
    SQLITE = "sqlite"
    ORACLE = "oracle"
    SQLSERVER = "sqlserver"
    MARIADB = "mariadb"
    HIVE = "hive"
    REDIS = "redis"


_ORACLE_OCI_INIT_LOCK = threading.Lock()
_ORACLE_OCI_INITIALIZED = False
_ORACLE_OCI_INIT_LIB_DIR: Optional[str] = None


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

    # 额外连接参数（用于驱动/方言/特定初始化，如 Oracle OCI/Instant Client）
    extra_params: Dict[str, Any] = Field(default_factory=dict, description="额外参数（不影响连接串的通用字段）")
    
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
        
        # Oracle 厚模式（Instant Client / OCI）初始化是进程级动作。
        # 将其放在构造连接串时做，确保 QueryWorker 等路径在真正创建连接前完成初始化。
        if self.db_type == DatabaseType.ORACLE:
            self.ensure_oracle_oci_initialized()
        
        password = self.password.get_secret_value()
        
        # Redis 使用特殊的连接字符串格式
        if self.db_type == DatabaseType.REDIS:
            # Redis 连接字符串格式: redis://[username]:[password]@host:port/[database]
            if password:
                encoded_password = quote_plus(password)
                if self.username:
                    encoded_username = quote_plus(self.username)
                    return f"redis://{encoded_username}:{encoded_password}@{self.host}:{self.port}/{self.database or 0}"
                else:
                    return f"redis://:{encoded_password}@{self.host}:{self.port}/{self.database or 0}"
            else:
                return f"redis://{self.host}:{self.port}/{self.database or 0}"
        
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
        encoded_database = quote_plus(self.database)
        
        # Hive 特殊处理：如果没有密码，不包含密码部分
        if self.db_type == DatabaseType.HIVE and not password:
            connection_string = (
                f"{driver}://{encoded_username}@"
                f"{self.host}:{self.port}/{self.database}"
            )
        elif self.db_type == DatabaseType.ORACLE:
            # Oracle：支持同时配置 service_name / sid（避免 ORA-12505）
            # 默认按 service_name 拼接；如果你的库是 SID，需要在 UI 里切换。
            extra = self.extra_params or {}
            oracle_identifier_type = (extra.get("oracle_identifier_type") or "service_name").strip().lower()
            if oracle_identifier_type == "sid":
                connection_string = (
                    f"{driver}://{encoded_username}:{encoded_password}@{self.host}:{self.port}/"
                    f"?sid={encoded_database}"
                )
            else:
                connection_string = (
                    f"{driver}://{encoded_username}:{encoded_password}@{self.host}:{self.port}/"
                    f"?service_name={encoded_database}"
                )
        else:
            connection_string = (
                f"{driver}://{encoded_username}:{encoded_password}@"
                f"{self.host}:{self.port}/{self.database}"
            )
        
        # 添加URL参数（只添加URL支持的参数）
        params = []
        if self.charset and self.db_type in [DatabaseType.MYSQL, DatabaseType.MARIADB]:
            params.append(f"charset={self.charset}")
        
        # Hive 有密码时需要指定认证模式
        if self.db_type == DatabaseType.HIVE and password:
            params.append("auth=LDAP")
        
        if params:
            connection_string += "?" + "&".join(params)
        
        return connection_string

    @staticmethod
    def _to_bool(v: Any) -> bool:
        if isinstance(v, bool):
            return v
        if v is None:
            return False
        if isinstance(v, (int, float)):
            return v != 0
        if isinstance(v, str):
            return v.strip().lower() in ("1", "true", "yes", "y", "on", "t")
        return bool(v)

    def ensure_oracle_oci_initialized(self) -> None:
        """
        初始化 Oracle 厚模式（Instant Client / OCI）。
        - oracledb 的 init_oracle_client 是进程级、全局幂等动作。
        - 为了不阻断“先保存连接配置、后再测试”的工作流，初始化失败会记录日志但不抛出异常。
        """
        global _ORACLE_OCI_INITIALIZED, _ORACLE_OCI_INIT_LIB_DIR

        if self.db_type != DatabaseType.ORACLE:
            return

        extra = self.extra_params or {}
        use_thick_mode = self._to_bool(extra.get("use_thick_mode")) or bool(extra.get("lib_dir"))
        if not use_thick_mode:
            return

        lib_dir = (extra.get("lib_dir") or "").strip() or None
        # 容错：如果用户把 lib_dir 填成了 oci.dll 文件路径，则转成其所在目录
        if isinstance(lib_dir, str) and lib_dir.lower().endswith(".dll"):
            lib_dir = os.path.dirname(lib_dir)
        tns_admin = (extra.get("tns_admin") or "").strip() or None

        with _ORACLE_OCI_INIT_LOCK:
            if _ORACLE_OCI_INITIALIZED:
                if lib_dir and _ORACLE_OCI_INIT_LIB_DIR and lib_dir != _ORACLE_OCI_INIT_LIB_DIR:
                    logger.warning(
                        "Oracle OCI 已初始化，但当前连接的 lib_dir 与已初始化 lib_dir 不一致；"
                        "oracledb init_oracle_client 是进程级动作，将使用首次初始化的配置。",
                    )
                return

            try:
                import oracledb  # type: ignore

                if tns_admin:
                    # 让 thick mode 能解析 tnsnames/sqlnet 配置
                    os.environ["TNS_ADMIN"] = tns_admin

                if lib_dir:
                    oracledb.init_oracle_client(lib_dir=lib_dir)
                else:
                    # 如果用户未显式提供 lib_dir，但希望厚模式由系统环境变量/默认安装路径推断
                    oracledb.init_oracle_client()

                _ORACLE_OCI_INITIALIZED = True
                _ORACLE_OCI_INIT_LIB_DIR = lib_dir
            except Exception as e:
                # 不抛异常：允许用户保存配置，后续连接测试/查询时仍会给出驱动错误信息。
                logger.warning(f"Oracle OCI 初始化失败（稍后连接时可能仍会失败）：{e}")
    
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
            # oracledb 的超时关键字使用 tcp_connect_timeout（单位：秒）
            # 注意：connect_timeout 不是 oracledb.connect() 的参数名，会导致 unexpected keyword argument。
            connect_args['tcp_connect_timeout'] = self.timeout
        elif self.db_type == DatabaseType.POSTGRESQL:
            # PostgreSQL (psycopg2) 连接参数
            connect_args['connect_timeout'] = self.timeout
        elif self.db_type == DatabaseType.SQLSERVER:
            # SQL Server (pyodbc) 连接参数
            connect_args['timeout'] = self.timeout
        elif self.db_type == DatabaseType.HIVE:
            # Hive (pyhive) 连接参数
            # pyhive.hive.Connection 不接受额外的连接参数
            # 使用默认配置即可
            pass
        elif self.db_type == DatabaseType.REDIS:
            # Redis 连接参数
            # redis-py 使用 socket_connect_timeout 和 socket_timeout
            connect_args['socket_connect_timeout'] = self.timeout
            connect_args['socket_timeout'] = self.timeout
            # 如果指定了数据库，使用 db 参数（移除硬编码的范围限制）
            if self.database:
                try:
                    db_num = int(self.database)
                    if db_num >= 0:  # 只检查非负数
                        connect_args['db'] = db_num
                except ValueError:
                    pass
            # SSL 设置
            if self.use_ssl:
                connect_args['ssl'] = True
        
        return connect_args
    
    def get_display_name(self) -> str:
        """获取显示名称"""
        return f"{self.name} ({self.db_type.value}://{self.host}:{self.port}/{self.database})"

