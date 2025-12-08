"""
连接信息持久化存储
"""
import json
import base64
from pathlib import Path
from typing import List, Optional
import logging
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend

from src.core.database_connection import DatabaseConnection, DatabaseType
from pydantic import SecretStr

logger = logging.getLogger(__name__)


class ConnectionStorage:
    """连接信息存储管理器"""
    
    def __init__(self, storage_path: Optional[Path] = None):
        """
        初始化存储管理器
        
        Args:
            storage_path: 存储文件路径，默认为用户目录下的 .db-ai/connections.json
        """
        if storage_path is None:
            # 默认存储在用户目录
            home = Path.home()
            storage_dir = home / ".db-ai"
            storage_dir.mkdir(exist_ok=True)
            storage_path = storage_dir / "connections.json"
        
        self.storage_path = Path(storage_path)
        self._key = self._get_or_create_key()
    
    def _get_or_create_key(self) -> bytes:
        """获取或创建加密密钥"""
        key_file = self.storage_path.parent / ".key"
        
        if key_file.exists():
            # 读取现有密钥
            with open(key_file, 'rb') as f:
                return f.read()
        else:
            # 生成新密钥
            key = Fernet.generate_key()
            with open(key_file, 'wb') as f:
                f.write(key)
            # 设置文件权限（仅所有者可读）
            key_file.chmod(0o600)
            return key
    
    def _encrypt_password(self, password: str) -> str:
        """加密密码"""
        if not password:
            return ""
        f = Fernet(self._key)
        encrypted = f.encrypt(password.encode('utf-8'))
        return base64.b64encode(encrypted).decode('utf-8')
    
    def _decrypt_password(self, encrypted_password: str) -> str:
        """解密密码"""
        if not encrypted_password:
            return ""
        try:
            f = Fernet(self._key)
            encrypted_bytes = base64.b64decode(encrypted_password.encode('utf-8'))
            decrypted = f.decrypt(encrypted_bytes)
            return decrypted.decode('utf-8')
        except Exception as e:
            logger.error(f"解密密码失败: {str(e)}")
            return ""
    
    def save_connections(self, connections: List[DatabaseConnection]) -> bool:
        """保存连接列表"""
        try:
            # 如果连接列表为空，不保存（避免覆盖已有数据）
            if not connections:
                logger.warning("连接列表为空，跳过保存以避免覆盖已有数据")
                # 如果文件已存在且不为空，不覆盖
                if self.storage_path.exists() and self.storage_path.stat().st_size > 0:
                    logger.warning("已有连接文件且不为空，保留现有数据")
                return False
            
            # 验证连接数据的有效性
            valid_connections = []
            for conn in connections:
                if not conn or not conn.name or not conn.id:
                    logger.warning(f"跳过无效连接: {conn}")
                    continue
                valid_connections.append(conn)
            
            if not valid_connections:
                logger.error("没有有效的连接可保存")
                return False
            
            # 如果有效连接数量明显减少（少于原来的50%），记录警告
            if self.storage_path.exists():
                try:
                    with open(self.storage_path, 'r', encoding='utf-8') as f:
                        existing_data = json.load(f)
                    existing_count = len(existing_data) if isinstance(existing_data, list) else 0
                    if existing_count > 0 and len(valid_connections) < existing_count * 0.5:
                        logger.warning(
                            f"警告：连接数量从 {existing_count} 减少到 {len(valid_connections)}，"
                            f"这可能表示数据丢失。将创建备份。"
                        )
                except Exception:
                    pass  # 如果无法读取现有文件，继续保存
            
            data = []
            for conn in valid_connections:
                try:
                    conn_dict = {
                        "id": conn.id,
                        "name": conn.name,
                        "db_type": conn.db_type.value,
                        "host": conn.host,
                        "port": conn.port,
                        "database": conn.database,
                        "username": conn.username,
                        "password": self._encrypt_password(conn.password.get_secret_value()),
                        "charset": conn.charset,
                        "timeout": conn.timeout,
                        "use_ssl": conn.use_ssl,
                        "is_active": conn.is_active,
                    }
                    data.append(conn_dict)
                except Exception as e:
                    logger.error(f"序列化连接失败: {conn.name if conn else 'Unknown'}, 错误: {str(e)}")
                    continue
            
            if not data:
                logger.error("没有可保存的连接数据")
                return False
            
            # 如果文件已存在，先创建备份
            if self.storage_path.exists():
                import shutil
                from datetime import datetime
                backup_path = self.storage_path.parent / f"connections_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
                try:
                    shutil.copy2(self.storage_path, backup_path)
                    logger.info(f"已创建备份文件: {backup_path}")
                    # 只保留最近5个备份
                    self._cleanup_old_backups()
                except Exception as e:
                    logger.warning(f"创建备份失败: {str(e)}")
            
            # 保存到文件（先写入临时文件，然后重命名，确保原子性）
            temp_path = self.storage_path.with_suffix('.json.tmp')
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            # 原子性替换
            import shutil
            shutil.move(temp_path, self.storage_path)
            
            # 设置文件权限（仅所有者可读）
            try:
                self.storage_path.chmod(0o600)
            except Exception:
                # Windows 上可能不支持 chmod，忽略错误
                pass
            
            logger.info(f"成功保存 {len(connections)} 个连接到 {self.storage_path}")
            return True
            
        except Exception as e:
            logger.error(f"保存连接失败: {str(e)}")
            return False
    
    def _cleanup_old_backups(self, keep_count: int = 5):
        """清理旧的备份文件，只保留最近的几个"""
        try:
            backup_files = sorted(
                self.storage_path.parent.glob("connections_backup_*.json"),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            # 删除多余的备份
            for backup_file in backup_files[keep_count:]:
                try:
                    backup_file.unlink()
                    logger.debug(f"已删除旧备份: {backup_file}")
                except Exception as e:
                    logger.warning(f"删除旧备份失败: {backup_file}, {str(e)}")
        except Exception as e:
            logger.warning(f"清理备份文件失败: {str(e)}")
    
    def load_connections(self) -> List[DatabaseConnection]:
        """加载连接列表"""
        connections = []
        
        if not self.storage_path.exists():
            logger.info(f"存储文件不存在: {self.storage_path}")
            # 尝试从备份文件恢复
            return self._try_load_from_backup()
        
        try:
            with open(self.storage_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # 如果数据为空，尝试从备份恢复
            if not data:
                logger.warning("连接文件为空，尝试从备份恢复")
                return self._try_load_from_backup()
            
            for conn_dict in data:
                try:
                    # 解密密码
                    encrypted_password = conn_dict.get("password", "")
                    password = self._decrypt_password(encrypted_password)
                    
                    connection = DatabaseConnection(
                        id=conn_dict.get("id"),
                        name=conn_dict.get("name", ""),
                        db_type=DatabaseType(conn_dict.get("db_type", "mysql")),
                        host=conn_dict.get("host", "localhost"),
                        port=conn_dict.get("port", 3306),
                        database=conn_dict.get("database", ""),
                        username=conn_dict.get("username", ""),
                        password=SecretStr(password),
                        charset=conn_dict.get("charset", "utf8mb4"),
                        timeout=conn_dict.get("timeout", 30),
                        use_ssl=conn_dict.get("use_ssl", False),
                        is_active=conn_dict.get("is_active", True),
                    )
                    connections.append(connection)
                except Exception as e:
                    logger.error(f"加载连接失败: {str(e)}, 数据: {conn_dict}")
                    continue
            
            logger.info(f"成功加载 {len(connections)} 个连接")
            return connections
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON解析失败: {str(e)}，尝试从备份恢复")
            return self._try_load_from_backup()
        except Exception as e:
            logger.error(f"加载连接失败: {str(e)}，尝试从备份恢复")
            return self._try_load_from_backup()
    
    def _try_load_from_backup(self) -> List[DatabaseConnection]:
        """尝试从备份文件恢复连接"""
        try:
            # 查找最新的备份文件
            backup_files = sorted(
                self.storage_path.parent.glob("connections_backup_*.json"),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            
            if not backup_files:
                logger.warning("没有找到备份文件")
                return []
            
            # 尝试从最新的备份文件加载
            for backup_file in backup_files:
                try:
                    logger.info(f"尝试从备份文件恢复: {backup_file}")
                    with open(backup_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    
                    if not data:
                        continue
                    
                    connections = []
                    for conn_dict in data:
                        try:
                            encrypted_password = conn_dict.get("password", "")
                            password = self._decrypt_password(encrypted_password)
                            
                            connection = DatabaseConnection(
                                id=conn_dict.get("id"),
                                name=conn_dict.get("name", ""),
                                db_type=DatabaseType(conn_dict.get("db_type", "mysql")),
                                host=conn_dict.get("host", "localhost"),
                                port=conn_dict.get("port", 3306),
                                database=conn_dict.get("database", ""),
                                username=conn_dict.get("username", ""),
                                password=SecretStr(password),
                                charset=conn_dict.get("charset", "utf8mb4"),
                                timeout=conn_dict.get("timeout", 30),
                                use_ssl=conn_dict.get("use_ssl", False),
                                is_active=conn_dict.get("is_active", True),
                            )
                            connections.append(connection)
                        except Exception as e:
                            logger.error(f"从备份加载连接失败: {str(e)}")
                            continue
                    
                    if connections:
                        logger.info(f"成功从备份恢复 {len(connections)} 个连接")
                        # 恢复主文件
                        import shutil
                        shutil.copy2(backup_file, self.storage_path)
                        return connections
                except Exception as e:
                    logger.error(f"从备份文件 {backup_file} 恢复失败: {str(e)}")
                    continue
            
            logger.warning("所有备份文件都无法恢复")
            return []
        except Exception as e:
            logger.error(f"尝试从备份恢复失败: {str(e)}")
            return []

