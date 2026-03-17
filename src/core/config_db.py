"""
配置数据库管理
使用 SQLite 存储所有配置数据
"""
import sqlite3
import json
import os
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime
from contextlib import contextmanager

logger = logging.getLogger(__name__)


class ConfigDB:
    """配置数据库管理类"""
    
    _instance = None
    _db_path = None
    
    def __new__(cls, db_path: str = None):
        """单例模式，确保只有一个数据库连接"""
        if cls._instance is None:
            cls._instance = super(ConfigDB, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self, db_path: str = None):
        """
        初始化配置数据库
        
        :param db_path: 数据库文件路径，默认为用户配置目录下的 config.db
        """
        if self._initialized:
            return
        
        if db_path is None:
            from src.config.settings import Settings
            config_dir = Settings.get_config_dir()
            db_path = os.path.join(config_dir, "config.db")
        
        self._db_path = db_path
        self._ensure_config_dir()
        self._init_database()
        self._initialized = True
        logger.info(f"配置数据库已初始化: {self._db_path}")
    
    def _ensure_config_dir(self):
        """确保配置目录存在"""
        config_dir = os.path.dirname(self._db_path)
        if config_dir and not os.path.exists(config_dir):
            os.makedirs(config_dir, exist_ok=True)
    
    def get_db_path(self) -> str:
        """获取配置数据库的文件路径"""
        return self._db_path
    
    @contextmanager
    def _get_connection(self):
        """获取数据库连接（上下文管理器）"""
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row  # 使用 Row 工厂，支持列名访问
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"数据库操作失败: {str(e)}", exc_info=True)
            raise
        finally:
            conn.close()
    
    def _init_database(self):
        """初始化数据库表结构"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # 1. 数据库连接配置表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS connections (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    db_type TEXT NOT NULL,
                    host TEXT,
                    port INTEGER,
                    database_name TEXT,
                    username TEXT,
                    password TEXT,
                    charset TEXT,
                    extra_params TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            
            # 2. 提示词配置表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS prompts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    prompt_type TEXT NOT NULL UNIQUE,
                    content TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            
            # 3. 应用设置表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    value_type TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            
            # 6. AI 模型配置表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS ai_models (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    api_key TEXT,
                    base_url TEXT,
                    default_model TEXT NOT NULL DEFAULT 'qwen-plus',
                    turbo_model TEXT NOT NULL DEFAULT 'qwen-turbo',
                    is_active INTEGER DEFAULT 1,
                    is_current INTEGER DEFAULT 0,
                    is_default INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            
            # 7. Token 统计表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS token_stats (
                    model_id TEXT PRIMARY KEY,
                    total_tokens INTEGER DEFAULT 0,
                    prompt_tokens INTEGER DEFAULT 0,
                    completion_tokens INTEGER DEFAULT 0,
                    request_count INTEGER DEFAULT 0,
                    last_used TEXT,
                    updated_at TEXT NOT NULL
                )
            """)

            # 8. 查询历史表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS query_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    connection_id TEXT NOT NULL,
                    database_name TEXT NOT NULL DEFAULT '',
                    sql TEXT NOT NULL,
                    title TEXT DEFAULT '',
                    is_favorite INTEGER DEFAULT 0,
                    source TEXT NOT NULL DEFAULT 'MANUAL', -- MANUAL / AI / CLI
                    executed_at TEXT NOT NULL,
                    duration_ms INTEGER DEFAULT 0
                )
            """)
            
            # 检查是否需要迁移旧表结构或添加新字段
            cursor.execute("PRAGMA table_info(ai_models)")
            columns = [row[1] for row in cursor.fetchall()]
            
            # 检查是否需要添加 is_current 字段
            if 'is_current' not in columns:
                logger.info("检测到ai_models表缺少is_current字段，正在添加...")
                try:
                    cursor.execute("ALTER TABLE ai_models ADD COLUMN is_current INTEGER DEFAULT 0")
                    logger.info("已添加is_current字段")
                    
                    # 尝试从 settings 表迁移 last_used_ai_model_id
                    cursor.execute('SELECT value FROM settings WHERE key = "last_used_ai_model_id"')
                    row = cursor.fetchone()
                    if row:
                        last_used_id = row[0]
                        # 将该模型标记为当前使用
                        cursor.execute("UPDATE ai_models SET is_current = 1 WHERE id = ? AND is_active = 1", (last_used_id,))
                        logger.info(f"已将模型 {last_used_id} 标记为当前使用（从settings表迁移）")
                        # 删除 settings 表中的旧记录
                        cursor.execute('DELETE FROM settings WHERE key = "last_used_ai_model_id"')
                        logger.info("已删除settings表中的last_used_ai_model_id记录")
                    else:
                        # 如果没有旧记录，将第一个激活的模型标记为当前使用
                        cursor.execute("UPDATE ai_models SET is_current = 1 WHERE id = (SELECT id FROM ai_models WHERE is_active = 1 ORDER BY created_at LIMIT 1)")
                        logger.info("已将第一个激活的模型标记为当前使用")
                except Exception as e:
                    logger.error(f"添加is_current字段失败: {str(e)}")
            
            # 如果是旧表结构（有model_name字段），需要迁移
            if 'model_name' in columns and 'name' not in columns:
                logger.info("检测到旧的ai_models表结构，开始迁移...")
                # 重命名旧表
                cursor.execute("ALTER TABLE ai_models RENAME TO ai_models_old")
                # 创建新表
                cursor.execute("""
                    CREATE TABLE ai_models (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        provider TEXT NOT NULL,
                        api_key TEXT,
                        base_url TEXT,
                        default_model TEXT NOT NULL DEFAULT 'qwen-plus',
                        turbo_model TEXT NOT NULL DEFAULT 'qwen-turbo',
                        is_active INTEGER DEFAULT 1,
                        is_default INTEGER DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                """)
                # 迁移数据（尽力而为）
                try:
                    cursor.execute("""
                        INSERT INTO ai_models (id, name, provider, api_key, base_url, default_model, is_default, created_at, updated_at)
                        SELECT 
                            'model_' || CAST(id AS TEXT),
                            provider || ' - ' || model_name,
                            provider,
                            api_key,
                            api_base,
                            model_name,
                            is_default,
                            created_at,
                            updated_at
                        FROM ai_models_old
                    """)
                    # 删除旧表
                    cursor.execute("DROP TABLE ai_models_old")
                    logger.info("ai_models表结构迁移完成")
                except Exception as e:
                    logger.warning(f"迁移ai_models表数据失败，使用新表: {str(e)}")
                    # 如果迁移失败，删除旧表
                    try:
                        cursor.execute("DROP TABLE IF EXISTS ai_models_old")
                    except:
                        pass
            
            logger.info("数据库表结构已初始化")
    
    # ==================== 连接配置管理 ====================
    
    def save_connection(self, conn_data: Dict[str, Any]):
        """
        保存数据库连接配置
        
        :param conn_data: 连接配置字典
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            now = datetime.now().isoformat()
            
            # 检查是否存在
            cursor.execute("SELECT id FROM connections WHERE id = ?", (conn_data['id'],))
            exists = cursor.fetchone()
            
            if exists:
                # 更新
                cursor.execute("""
                    UPDATE connections SET
                        name = ?, db_type = ?, host = ?, port = ?,
                        database_name = ?, username = ?, password = ?,
                        charset = ?, extra_params = ?, updated_at = ?
                    WHERE id = ?
                """, (
                    conn_data['name'], conn_data['db_type'], conn_data.get('host'),
                    conn_data.get('port'), conn_data.get('database'), conn_data.get('username'),
                    conn_data.get('password'), conn_data.get('charset'),
                    json.dumps(conn_data.get('extra_params', {})), now, conn_data['id']
                ))
                logger.debug(f"更新连接配置: {conn_data['id']}")
            else:
                # 插入
                cursor.execute("""
                    INSERT INTO connections 
                    (id, name, db_type, host, port, database_name, username, password, 
                     charset, extra_params, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    conn_data['id'], conn_data['name'], conn_data['db_type'],
                    conn_data.get('host'), conn_data.get('port'), conn_data.get('database'),
                    conn_data.get('username'), conn_data.get('password'), conn_data.get('charset'),
                    json.dumps(conn_data.get('extra_params', {})), now, now
                ))
                logger.debug(f"保存新连接配置: {conn_data['id']}")
    
    def get_connection(self, connection_id: str) -> Optional[Dict[str, Any]]:
        """
        获取数据库连接配置
        
        :param connection_id: 连接ID
        :return: 连接配置字典，不存在返回 None
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM connections WHERE id = ?", (connection_id,))
            row = cursor.fetchone()
            
            if row:
                return {
                    'id': row['id'],
                    'name': row['name'],
                    'db_type': row['db_type'],
                    'host': row['host'],
                    'port': row['port'],
                    'database': row['database_name'],
                    'username': row['username'],
                    'password': row['password'],
                    'charset': row['charset'],
                    'extra_params': json.loads(row['extra_params']) if row['extra_params'] else {}
                }
            return None
    
    def get_all_connections(self) -> List[Dict[str, Any]]:
        """
        获取所有数据库连接配置
        
        :return: 连接配置列表
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM connections ORDER BY name")
            rows = cursor.fetchall()
            
            connections = []
            for row in rows:
                connections.append({
                    'id': row['id'],
                    'name': row['name'],
                    'db_type': row['db_type'],
                    'host': row['host'],
                    'port': row['port'],
                    'database': row['database_name'],
                    'username': row['username'],
                    'password': row['password'],
                    'charset': row['charset'],
                    'extra_params': json.loads(row['extra_params']) if row['extra_params'] else {}
                })
            
            return connections
    
    def delete_connection(self, connection_id: str):
        """
        删除数据库连接配置
        
        :param connection_id: 连接ID
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM connections WHERE id = ?", (connection_id,))
            logger.debug(f"删除连接配置: {connection_id}")
    
    # ==================== 提示词配置管理 ====================
    
    def save_prompt(self, prompt_type: str, content: str):
        """
        保存提示词配置
        
        :param prompt_type: 提示词类型（如 generate_sql_system, select_tables_system 等）
        :param content: 提示词内容
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            now = datetime.now().isoformat()
            
            cursor.execute("""
                INSERT OR REPLACE INTO prompts (prompt_type, content, updated_at)
                VALUES (?, ?, ?)
            """, (prompt_type, content, now))
            
            logger.debug(f"保存提示词配置: {prompt_type}")
    
    def get_prompt(self, prompt_type: str) -> Optional[str]:
        """
        获取提示词配置
        
        :param prompt_type: 提示词类型
        :return: 提示词内容，不存在返回 None
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT content FROM prompts WHERE prompt_type = ?", (prompt_type,))
            row = cursor.fetchone()
            return row['content'] if row else None
    
    def get_all_prompts(self) -> Dict[str, str]:
        """
        获取所有提示词配置
        
        :return: 提示词类型 -> 内容的字典
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT prompt_type, content FROM prompts")
            rows = cursor.fetchall()
            return {row['prompt_type']: row['content'] for row in rows}
    
    # ==================== 应用设置管理 ====================
    
    def save_setting(self, key: str, value: Any):
        """
        保存应用设置
        
        :param key: 设置键
        :param value: 设置值（自动转换为字符串）
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            now = datetime.now().isoformat()
            
            # 确定值类型
            value_type = type(value).__name__
            value_str = json.dumps(value) if isinstance(value, (dict, list)) else str(value)
            
            cursor.execute("""
                INSERT OR REPLACE INTO settings (key, value, value_type, updated_at)
                VALUES (?, ?, ?, ?)
            """, (key, value_str, value_type, now))
            
            logger.debug(f"保存设置: {key} = {value}")
    
    def get_setting(self, key: str, default: Any = None) -> Any:
        """
        获取应用设置
        
        :param key: 设置键
        :param default: 默认值
        :return: 设置值，不存在返回默认值
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value, value_type FROM settings WHERE key = ?", (key,))
            row = cursor.fetchone()
            
            if row:
                value_str = row['value']
                value_type = row['value_type']
                
                # 根据类型转换
                if value_type == 'dict' or value_type == 'list':
                    return json.loads(value_str)
                elif value_type == 'int':
                    return int(value_str)
                elif value_type == 'float':
                    return float(value_str)
                elif value_type == 'bool':
                    return value_str.lower() in ('true', '1', 'yes')
                else:
                    return value_str
            
            return default
    
    def get_all_settings(self) -> Dict[str, Any]:
        """
        获取所有应用设置
        
        :return: 设置字典
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT key, value, value_type FROM settings")
            rows = cursor.fetchall()
            
            settings = {}
            for row in rows:
                key = row['key']
                value_str = row['value']
                value_type = row['value_type']
                
                if value_type == 'dict' or value_type == 'list':
                    settings[key] = json.loads(value_str)
                elif value_type == 'int':
                    settings[key] = int(value_str)
                elif value_type == 'float':
                    settings[key] = float(value_str)
                elif value_type == 'bool':
                    settings[key] = value_str.lower() in ('true', '1', 'yes')
                else:
                    settings[key] = value_str
            
            return settings
    
    # ==================== AI 模型配置管理 ====================
    
    def save_ai_model(self, model_data: Dict[str, Any]) -> str:
        """
        保存 AI 模型配置
        
        :param model_data: 模型配置字典
        :return: 模型ID
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            now = datetime.now().isoformat()
            
            model_id = model_data.get('id')
            
            # 注意：is_default 字段已废弃，不再使用
            
            if model_id:
                # 检查模型是否存在
                cursor.execute("SELECT id FROM ai_models WHERE id = ?", (model_id,))
                exists = cursor.fetchone() is not None
                
                if exists:
                    # 更新
                    cursor.execute("""
                        UPDATE ai_models SET
                            name = ?, provider = ?, api_key = ?, base_url = ?,
                            default_model = ?, turbo_model = ?, 
                            is_active = ?, updated_at = ?
                        WHERE id = ?
                    """, (
                        model_data['name'], model_data['provider'],
                        model_data.get('api_key'), model_data.get('base_url'),
                        model_data.get('default_model', 'qwen-plus'),
                        model_data.get('turbo_model', 'qwen-turbo'),
                        1 if model_data.get('is_active', True) else 0,
                        now, model_id
                    ))
                    logger.debug(f"更新AI模型配置: {model_id}")
                    return model_id
            
            # 插入新模型
            import uuid
            if not model_id:
                model_id = str(uuid.uuid4())
            
            cursor.execute("""
                INSERT INTO ai_models 
                (id, name, provider, api_key, base_url, default_model, turbo_model, 
                 is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                model_id, model_data['name'], model_data['provider'],
                model_data.get('api_key'), model_data.get('base_url'),
                model_data.get('default_model', 'qwen-plus'),
                model_data.get('turbo_model', 'qwen-turbo'),
                1 if model_data.get('is_active', True) else 0,
                now, now
            ))
            logger.debug(f"保存新AI模型配置: {model_id}")
            return model_id
    
    def get_current_ai_model(self) -> Optional[Dict[str, Any]]:
        """
        获取当前使用的 AI 模型配置（基于 is_current 字段）
        
        :return: 模型配置字典，不存在返回 None
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM ai_models WHERE is_current = 1 AND is_active = 1 ORDER BY updated_at DESC LIMIT 1")
            row = cursor.fetchone()
            
            if row:
                return {
                    'id': row['id'],
                    'name': row['name'],
                    'provider': row['provider'],
                    'api_key': row['api_key'],
                    'base_url': row['base_url'],
                    'default_model': row['default_model'],
                    'turbo_model': row['turbo_model'],
                    'is_active': bool(row['is_active']),
                    'is_current': bool(row['is_current']),
                }
            
            return None
    
    def set_current_ai_model(self, model_id: str) -> bool:
        """
        设置当前使用的 AI 模型
        
        :param model_id: 模型ID
        :return: 是否设置成功
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # 首先检查模型是否存在且激活
            cursor.execute("SELECT id, is_current FROM ai_models WHERE id = ? AND is_active = 1", (model_id,))
            model_row = cursor.fetchone()
            if not model_row:
                logger.warning(f"模型 {model_id} 不存在或未激活")
                return False
            
            # 如果该模型已经是当前模型，则不需要更新
            if model_row['is_current']:
                logger.debug(f"模型 {model_id} 已经是当前使用的模型，跳过更新")
                return True
            
            # 获取模型名称用于日志
            cursor.execute("SELECT name FROM ai_models WHERE id = ?", (model_id,))
            name_row = cursor.fetchone()
            model_name = name_row['name'] if name_row else model_id
            
            # 取消所有模型的 is_current 标记
            cursor.execute("UPDATE ai_models SET is_current = 0")
            
            # 设置指定模型为当前使用
            cursor.execute("UPDATE ai_models SET is_current = 1 WHERE id = ?", (model_id,))
            
            logger.info(f"已更新当前使用的AI模型: {model_name} (ID: {model_id})")
            logger.debug(f"已设置当前使用的AI模型: {model_id}")
            return True
    
    # 保持向后兼容的别名
    def get_default_ai_model(self) -> Optional[Dict[str, Any]]:
        """获取默认AI模型（向后兼容，实际返回当前使用的模型）"""
        return self.get_current_ai_model()
    
    def get_all_ai_models(self) -> List[Dict[str, Any]]:
        """
        获取所有 AI 模型配置
        
        :return: 模型配置列表
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM ai_models ORDER BY created_at DESC")
            rows = cursor.fetchall()
            
            models = []
            for row in rows:
                models.append({
                    'id': row['id'],
                    'name': row['name'],
                    'provider': row['provider'],
                    'api_key': row['api_key'],
                    'base_url': row['base_url'],
                    'default_model': row['default_model'],
                    'turbo_model': row['turbo_model'],
                    'is_active': bool(row['is_active']),
                    'is_current': bool(row['is_current']),
                })
            
            return models
    
    def delete_ai_model(self, model_id: str) -> bool:
        """
        删除 AI 模型配置
        
        :param model_id: 模型ID
        :return: 是否删除成功
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM ai_models WHERE id = ?", (model_id,))
            return cursor.rowcount > 0
    
    def get_ai_model_by_id(self, model_id: str) -> Optional[Dict[str, Any]]:
        """
        根据ID获取AI模型配置
        
        :param model_id: 模型ID
        :return: 模型配置字典，不存在返回 None
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM ai_models WHERE id = ?", (model_id,))
            row = cursor.fetchone()
            
            if row:
                return {
                    'id': row['id'],
                    'name': row['name'],
                    'provider': row['provider'],
                    'api_key': row['api_key'],
                    'base_url': row['base_url'],
                    'default_model': row['default_model'],
                    'turbo_model': row['turbo_model'],
                    'is_active': bool(row['is_active']),
                    'is_current': bool(row['is_current']),
                }
            return None
    
    # ==================== Token 统计管理 ====================
    
    def get_token_stats(self, model_id: str) -> Optional[Dict[str, Any]]:
        """
        获取指定模型的 Token 统计
        
        :param model_id: 模型ID
        :return: Token统计字典，不存在返回 None
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM token_stats WHERE model_id = ?", (model_id,))
            row = cursor.fetchone()
            
            if row:
                return {
                    'model_id': row['model_id'],
                    'total_tokens': row['total_tokens'],
                    'prompt_tokens': row['prompt_tokens'],
                    'completion_tokens': row['completion_tokens'],
                    'request_count': row['request_count'],
                    'last_used': row['last_used'],
                }
            return None
    
    def save_token_stats(self, model_id: str, total_tokens: int, prompt_tokens: int, 
                        completion_tokens: int, request_count: int, last_used: str = None):
        """
        保存或更新 Token 统计
        
        :param model_id: 模型ID
        :param total_tokens: 总token数
        :param prompt_tokens: 输入token数
        :param completion_tokens: 输出token数
        :param request_count: 请求次数
        :param last_used: 最后使用时间（ISO格式字符串），如果为None则使用当前时间
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            now = datetime.now().isoformat()
            
            if last_used is None:
                last_used = now
            
            cursor.execute("""
                INSERT OR REPLACE INTO token_stats 
                (model_id, total_tokens, prompt_tokens, completion_tokens, request_count, last_used, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (model_id, total_tokens, prompt_tokens, completion_tokens, request_count, last_used, now))
            
            logger.debug(f"保存Token统计: {model_id}")
    
    def add_token_usage(self, model_id: str, prompt_tokens: int, completion_tokens: int):
        """
        添加 Token 使用记录（累加）
        
        :param model_id: 模型ID
        :param prompt_tokens: 本次使用的输入token数
        :param completion_tokens: 本次使用的输出token数
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            now = datetime.now().isoformat()
            
            # 先获取当前统计
            cursor.execute("SELECT * FROM token_stats WHERE model_id = ?", (model_id,))
            row = cursor.fetchone()
            
            if row:
                # 更新现有记录
                new_total = row['total_tokens'] + prompt_tokens + completion_tokens
                new_prompt = row['prompt_tokens'] + prompt_tokens
                new_completion = row['completion_tokens'] + completion_tokens
                new_count = row['request_count'] + 1
                
                cursor.execute("""
                    UPDATE token_stats SET
                        total_tokens = ?,
                        prompt_tokens = ?,
                        completion_tokens = ?,
                        request_count = ?,
                        last_used = ?,
                        updated_at = ?
                    WHERE model_id = ?
                """, (new_total, new_prompt, new_completion, new_count, now, now, model_id))
            else:
                # 创建新记录
                total = prompt_tokens + completion_tokens
                cursor.execute("""
                    INSERT INTO token_stats 
                    (model_id, total_tokens, prompt_tokens, completion_tokens, request_count, last_used, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (model_id, total, prompt_tokens, completion_tokens, 1, now, now))
            
            logger.debug(f"添加Token使用: {model_id}, 输入={prompt_tokens}, 输出={completion_tokens}")
    
    def get_all_token_stats(self) -> List[Dict[str, Any]]:
        """
        获取所有模型的 Token 统计
        
        :return: Token统计列表
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM token_stats ORDER BY total_tokens DESC")
            rows = cursor.fetchall()
            
            stats = []
            for row in rows:
                stats.append({
                    'model_id': row['model_id'],
                    'total_tokens': row['total_tokens'],
                    'prompt_tokens': row['prompt_tokens'],
                    'completion_tokens': row['completion_tokens'],
                    'request_count': row['request_count'],
                    'last_used': row['last_used'],
                })
            
            return stats
    
    def clear_token_stats(self, model_id: str = None):
        """
        清除 Token 统计
        
        :param model_id: 模型ID，如果为None则清除所有统计
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if model_id:
                cursor.execute("DELETE FROM token_stats WHERE model_id = ?", (model_id,))
                logger.debug(f"清除模型 {model_id} 的Token统计")
            else:
                cursor.execute("DELETE FROM token_stats")
                logger.debug("清除所有Token统计")

    # ==================== 查询历史管理 ====================

    def add_query_history(
        self,
        connection_id: str,
        database_name: str,
        sql: str,
        source: str = "MANUAL",
        duration_ms: int = 0,
        title: Optional[str] = None,
    ) -> int:
        """
        新增一条查询历史记录

        :return: 新记录的自增ID
        """
        executed_at = datetime.now().isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO query_history
                    (connection_id, database_name, sql, title, is_favorite, source, executed_at, duration_ms)
                VALUES (?, ?, ?, ?, 0, ?, ?, ?)
                """,
                (
                    connection_id,
                    database_name or "",
                    sql,
                    title or "",
                    source,
                    executed_at,
                    duration_ms,
                ),
            )
            return cursor.lastrowid

    def get_recent_query_history(
        self,
        limit: int = 50,
        connection_id: Optional[str] = None,
        database_name: Optional[str] = None,
        only_favorites: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        获取最近的查询历史
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()

            conditions = []
            params: list[Any] = []

            if connection_id:
                conditions.append("connection_id = ?")
                params.append(connection_id)

            if database_name is not None:
                conditions.append("database_name = ?")
                params.append(database_name)

            if only_favorites:
                conditions.append("is_favorite = 1")

            where_clause = ""
            if conditions:
                where_clause = "WHERE " + " AND ".join(conditions)

            cursor.execute(
                f"""
                SELECT id, connection_id, database_name, sql, title,
                       is_favorite, source, executed_at, duration_ms
                FROM query_history
                {where_clause}
                ORDER BY executed_at DESC
                LIMIT ?
                """,
                (*params, limit),
            )

            rows = cursor.fetchall()
            results: List[Dict[str, Any]] = []
            for row in rows:
                results.append(
                    {
                        "id": row["id"],
                        "connection_id": row["connection_id"],
                        "database_name": row["database_name"],
                        "sql": row["sql"],
                        "title": row["title"],
                        "is_favorite": bool(row["is_favorite"]),
                        "source": row["source"],
                        "executed_at": row["executed_at"],
                        "duration_ms": row["duration_ms"],
                    }
                )
            return results

    def update_query_history_title(self, history_id: int, title: str) -> None:
        """更新查询历史标题"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE query_history
                SET title = ?
                WHERE id = ?
                """,
                (title, history_id),
            )

    def set_query_history_favorite(self, history_id: int, is_favorite: bool) -> None:
        """设置/取消收藏"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE query_history
                SET is_favorite = ?
                WHERE id = ?
                """,
                (1 if is_favorite else 0, history_id),
            )
    
    # ==================== 数据迁移工具 ====================
    
    def migrate_ai_models_from_json(self, ai_models_file: str = None):
        """
        从 JSON 文件迁移AI模型配置到 SQLite
        
        :param ai_models_file: AI模型配置 JSON 文件路径
        :return: 迁移的模型数量
        """
        if ai_models_file is None:
            from src.config.settings import Settings
            config_dir = Settings.get_config_dir()
            ai_models_file = os.path.join(config_dir, "ai_models.json")
        
        if not os.path.exists(ai_models_file):
            logger.info(f"AI模型配置文件不存在，无需迁移: {ai_models_file}")
            return 0
        
        try:
            import json
            with open(ai_models_file, 'r', encoding='utf-8') as f:
                models_data = json.load(f)
            
            migrated_count = 0
            for model_dict in models_data:
                try:
                    # 保存到SQLite
                    model_data = {
                        'id': model_dict.get('id'),
                        'name': model_dict.get('name', ''),
                        'provider': model_dict.get('provider', 'aliyun_qianwen'),
                        'api_key': model_dict.get('api_key'),
                        'base_url': model_dict.get('base_url'),
                        'default_model': model_dict.get('default_model', 'qwen-plus'),
                        'turbo_model': model_dict.get('turbo_model', 'qwen-turbo'),
                        'is_active': model_dict.get('is_active', True),
                    }
                    self.save_ai_model(model_data)
                    migrated_count += 1
                except Exception as e:
                    logger.error(f"迁移AI模型配置失败: {str(e)}, 数据: {model_dict}")
            
            # 迁移成功后，重命名JSON文件为.backup
            if migrated_count > 0:
                try:
                    backup_path = ai_models_file + '.backup'
                    os.rename(ai_models_file, backup_path)
                    logger.info(f"AI模型配置迁移完成: {migrated_count} 个模型，已将JSON文件重命名为 {os.path.basename(backup_path)}")
                except Exception as e:
                    logger.warning(f"重命名AI模型配置文件失败: {str(e)}")
            
            return migrated_count
            
        except Exception as e:
            logger.error(f"迁移AI模型配置失败: {str(e)}")
            return 0
    
    def migrate_from_json(self, connections_file: str = None,
                         tree_cache_file: str = None, ai_models_file: str = None):
        """
        从 JSON 文件迁移数据到 SQLite
        迁移成功后自动将 JSON 文件重命名为 .backup
        
        :param connections_file: 连接配置 JSON 文件路径
        :param tree_cache_file: 已废弃，保留参数以兼容旧调用方
        :param ai_models_file: AI模型配置 JSON 文件路径
        """
        migrated_count = 0
        migrated_files = []
        
        # 迁移AI模型配置
        models_count = self.migrate_ai_models_from_json(ai_models_file)
        migrated_count += models_count
        
        # 迁移连接配置
        if connections_file and os.path.exists(connections_file):
            try:
                with open(connections_file, 'r', encoding='utf-8') as f:
                    connections = json.load(f)
                    for conn in connections:
                        self.save_connection(conn)
                        migrated_count += 1
                logger.info(f"已迁移 {len(connections)} 个连接配置")
                migrated_files.append(connections_file)
            except Exception as e:
                logger.error(f"迁移连接配置失败: {str(e)}")
        
        # 迁移成功后，重命名 JSON 文件为 .backup
        for file_path in migrated_files:
            try:
                backup_path = file_path + '.backup'
                os.rename(file_path, backup_path)
                logger.info(f"已将 {os.path.basename(file_path)} 重命名为 {os.path.basename(backup_path)}")
            except Exception as e:
                logger.warning(f"重命名文件失败 {file_path}: {str(e)}")
        
        if migrated_count > 0:
            logger.info(f"数据迁移完成，共迁移 {migrated_count} 项")
        
        return migrated_count


    # ------------------------------------------------------------------ #
    # 记忆系统方法                                                           #
    # ------------------------------------------------------------------ #

    def ensure_memory_tables(self):
        """创建 AI 记忆相关表（幂等）"""
        with self._get_connection() as conn:
            c = conn.cursor()
            c.execute("""
                CREATE TABLE IF NOT EXISTS memory_naming_conventions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    connection_id TEXT NOT NULL,
                    database_name TEXT NOT NULL DEFAULT '',
                    pattern TEXT NOT NULL,
                    examples TEXT DEFAULT '[]',
                    confidence REAL DEFAULT 1.0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS memory_query_patterns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    connection_id TEXT NOT NULL,
                    database_name TEXT NOT NULL DEFAULT '',
                    user_intent TEXT NOT NULL,
                    generated_sql TEXT NOT NULL,
                    used_tables TEXT DEFAULT '[]',
                    use_count INTEGER DEFAULT 1,
                    last_used_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS memory_corrections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    connection_id TEXT NOT NULL,
                    database_name TEXT NOT NULL DEFAULT '',
                    user_query TEXT NOT NULL,
                    ai_sql TEXT NOT NULL,
                    corrected_sql TEXT NOT NULL,
                    correction_note TEXT DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)
            # 表级摘要：将大量原始 pattern 压缩成表使用规律，注入 prompt 效率更高
            c.execute("""
                CREATE TABLE IF NOT EXISTS memory_table_summaries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    connection_id TEXT NOT NULL,
                    database_name TEXT NOT NULL DEFAULT '',
                    table_key TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    pattern_count INTEGER DEFAULT 0,
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    UNIQUE(connection_id, database_name, table_key)
                )
            """)
            # 压缩日志：记录上次压缩时间，避免频繁触发
            c.execute("""
                CREATE TABLE IF NOT EXISTS memory_compression_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    connection_id TEXT NOT NULL,
                    database_name TEXT NOT NULL DEFAULT '',
                    compressed_at TEXT NOT NULL,
                    pattern_count INTEGER DEFAULT 0,
                    UNIQUE(connection_id, database_name)
                )
            """)

    def get_naming_conventions(self, connection_id: str, database_name: str, limit: int = 10):
        with self._get_connection() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT pattern FROM memory_naming_conventions "
                "WHERE connection_id=? AND database_name=? "
                "ORDER BY confidence DESC, updated_at DESC LIMIT ?",
                (connection_id, database_name, limit),
            )
            return [row[0] for row in c.fetchall()]

    def save_naming_convention(self, connection_id: str, database_name: str, pattern: str, examples: list):
        import json
        now = datetime.now().isoformat()
        with self._get_connection() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT id FROM memory_naming_conventions "
                "WHERE connection_id=? AND database_name=? AND pattern=?",
                (connection_id, database_name, pattern),
            )
            row = c.fetchone()
            if row:
                c.execute(
                    "UPDATE memory_naming_conventions SET examples=?, confidence=confidence+0.1, updated_at=? WHERE id=?",
                    (json.dumps(examples, ensure_ascii=False), now, row[0]),
                )
            else:
                c.execute(
                    "INSERT INTO memory_naming_conventions(connection_id,database_name,pattern,examples,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                    (connection_id, database_name, pattern, json.dumps(examples, ensure_ascii=False), now, now),
                )

    def search_query_patterns(self, connection_id: str, database_name: str, user_intent: str, top_k: int = 3):
        # 提取关键字符：字符二元组（bigram），兼容中英文，无需分词库
        def bigrams(text: str):
            t = text.strip()
            if len(t) <= 1:
                return list(t)
            return [t[i:i+2] for i in range(len(t) - 1)]

        query_bigrams = bigrams(user_intent)

        with self._get_connection() as conn:
            c = conn.cursor()

            # ── 第一路：热门记录（按使用频率+时间，保底候选）──────────
            c.execute(
                "SELECT user_intent, generated_sql, used_tables, use_count "
                "FROM memory_query_patterns "
                "WHERE connection_id=? AND database_name=? "
                "ORDER BY use_count DESC, last_used_at DESC LIMIT 20",
                (connection_id, database_name),
            )
            hot_rows = c.fetchall()

            # ── 第二路：关键字相关记录（全表 LIKE 搜索，不受TOP20限制）──
            # 策略：跳过头部动词bigram，取尾部名词bigram，用 AND 精确匹配
            # 例："统计订单总金额" → 跳过"统计""计订"，取"总金""金额" AND 条件
            like_rows = []
            if len(query_bigrams) >= 2:
                # 跳过前2个bigram（通常是"统计""查询"等动词），取后半段中最具体的
                content_bigrams = query_bigrams[2:] if len(query_bigrams) > 3 else query_bigrams
                # 最多取2个做 AND 条件：既精确又不会过于苛刻
                key_bigrams = content_bigrams[-2:] if len(content_bigrams) >= 2 else content_bigrams
                # AND 条件：同时包含多个关键bigram，避免"统计"一词命中所有记录
                and_conditions = " AND ".join(["user_intent LIKE ?" for _ in key_bigrams])
                like_params = [f"%{bg}%" for bg in key_bigrams]
                c.execute(
                    f"SELECT user_intent, generated_sql, used_tables, use_count "
                    f"FROM memory_query_patterns "
                    f"WHERE connection_id=? AND database_name=? AND ({and_conditions}) "
                    f"ORDER BY use_count DESC LIMIT 30",
                    (connection_id, database_name, *like_params),
                )
                like_rows = c.fetchall()

        # ── 合并去重，user_intent 为唯一键 ──────────────────────────
        cols = ["user_intent", "generated_sql", "used_tables", "use_count"]
        seen = {}
        for r in hot_rows + like_rows:
            d = dict(zip(cols, r))
            if d["user_intent"] not in seen:
                seen[d["user_intent"]] = d
        candidates = list(seen.values())

        if not query_bigrams:
            return candidates[:top_k]

        # ── bigram 相似度打分：命中二元组数 / 查询二元组总数 ──────────
        query_bg_set = set(query_bigrams)
        scored = []
        for r in candidates:
            record_bgs = set(bigrams(r["user_intent"]))
            hit = len(query_bg_set & record_bgs)
            if hit > 0:
                # 归一化得分：命中率，避免长句子天然得分高
                score = hit / len(query_bg_set)
                scored.append((score, r))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [r for _, r in scored[:top_k]]

    def upsert_query_pattern(self, connection_id: str, database_name: str, user_intent: str, generated_sql: str, used_tables: list):
        import json
        now = datetime.now().isoformat()
        with self._get_connection() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT id, use_count FROM memory_query_patterns "
                "WHERE connection_id=? AND database_name=? AND user_intent=?",
                (connection_id, database_name, user_intent),
            )
            row = c.fetchone()
            if row:
                c.execute(
                    "UPDATE memory_query_patterns SET generated_sql=?, used_tables=?, use_count=?, last_used_at=? WHERE id=?",
                    (generated_sql, json.dumps(used_tables, ensure_ascii=False), row[1] + 1, now, row[0]),
                )
            else:
                c.execute(
                    "INSERT INTO memory_query_patterns(connection_id,database_name,user_intent,generated_sql,used_tables,last_used_at) VALUES(?,?,?,?,?,?)",
                    (connection_id, database_name, user_intent, generated_sql, json.dumps(used_tables, ensure_ascii=False), now),
                )

    def get_recent_corrections(self, connection_id: str, database_name: str, limit: int = 3):
        with self._get_connection() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT user_query, ai_sql, corrected_sql, correction_note "
                "FROM memory_corrections "
                "WHERE connection_id=? AND database_name=? "
                "ORDER BY created_at DESC LIMIT ?",
                (connection_id, database_name, limit),
            )
            return [dict(zip(["user_query", "ai_sql", "corrected_sql", "correction_note"], r)) for r in c.fetchall()]

    def save_correction(self, connection_id: str, database_name: str, user_query: str, ai_sql: str, corrected_sql: str, note: str = ""):
        now = datetime.now().isoformat()
        with self._get_connection() as conn:
            c = conn.cursor()
            c.execute(
                "INSERT INTO memory_corrections(connection_id,database_name,user_query,ai_sql,corrected_sql,correction_note,created_at) VALUES(?,?,?,?,?,?,?)",
                (connection_id, database_name, user_query, ai_sql, corrected_sql, note, now),
            )

    # ------------------------------------------------------------------ #
    # 记忆压缩：表级摘要                                                    #
    # ------------------------------------------------------------------ #
    def get_pattern_count(self, connection_id: str, database_name: str) -> int:
        """获取当前 pattern 总条数"""
        with self._get_connection() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT COUNT(*) FROM memory_query_patterns WHERE connection_id=? AND database_name=?",
                (connection_id, database_name),
            )
            row = c.fetchone()
            return row[0] if row else 0

    def get_all_patterns_for_compression(self, connection_id: str, database_name: str) -> list:
        """获取所有 pattern，供压缩使用"""
        import json
        with self._get_connection() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT user_intent, generated_sql, used_tables, use_count "
                "FROM memory_query_patterns "
                "WHERE connection_id=? AND database_name=? "
                "ORDER BY use_count DESC",
                (connection_id, database_name),
            )
            rows = c.fetchall()
            return [
                {
                    "user_intent": r[0],
                    "generated_sql": r[1],
                    "used_tables": json.loads(r[2] or "[]"),
                    "use_count": r[3],
                }
                for r in rows
            ]

    def save_table_summary(self, connection_id: str, database_name: str,
                           table_key: str, summary: str, pattern_count: int):
        """保存或更新表级摘要（upsert）"""
        now = datetime.now().isoformat()
        with self._get_connection() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT id FROM memory_table_summaries "
                "WHERE connection_id=? AND database_name=? AND table_key=?",
                (connection_id, database_name, table_key),
            )
            row = c.fetchone()
            if row:
                c.execute(
                    "UPDATE memory_table_summaries SET summary=?, pattern_count=?, updated_at=? WHERE id=?",
                    (summary, pattern_count, now, row[0]),
                )
            else:
                c.execute(
                    "INSERT INTO memory_table_summaries(connection_id,database_name,table_key,summary,pattern_count,updated_at) "
                    "VALUES(?,?,?,?,?,?)",
                    (connection_id, database_name, table_key, summary, pattern_count, now),
                )

    def get_table_summaries(self, connection_id: str, database_name: str) -> list:
        """获取所有表级摘要，按 pattern_count 降序"""
        with self._get_connection() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT table_key, summary, pattern_count FROM memory_table_summaries "
                "WHERE connection_id=? AND database_name=? "
                "ORDER BY pattern_count DESC",
                (connection_id, database_name),
            )
            return [
                {"table_key": r[0], "summary": r[1], "pattern_count": r[2]}
                for r in c.fetchall()
            ]

    def get_last_compression_time(self, connection_id: str, database_name: str):
        """返回上次压缩时间（datetime 对象），未压缩过则返回 None"""
        with self._get_connection() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT compressed_at FROM memory_compression_log "
                "WHERE connection_id=? AND database_name=?",
                (connection_id, database_name),
            )
            row = c.fetchone()
            if not row:
                return None
            try:
                return datetime.fromisoformat(row[0])
            except Exception:
                return None

    def update_compression_log(self, connection_id: str, database_name: str, pattern_count: int):
        """更新压缩日志"""
        now = datetime.now().isoformat()
        with self._get_connection() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT id FROM memory_compression_log WHERE connection_id=? AND database_name=?",
                (connection_id, database_name),
            )
            row = c.fetchone()
            if row:
                c.execute(
                    "UPDATE memory_compression_log SET compressed_at=?, pattern_count=? WHERE id=?",
                    (now, pattern_count, row[0]),
                )
            else:
                c.execute(
                    "INSERT INTO memory_compression_log(connection_id,database_name,compressed_at,pattern_count) VALUES(?,?,?,?)",
                    (connection_id, database_name, now, pattern_count),
                )


# 全局实例
_config_db_instance = None


def get_config_db() -> ConfigDB:
    """获取配置数据库全局实例"""
    global _config_db_instance
    if _config_db_instance is None:
        _config_db_instance = ConfigDB()
    return _config_db_instance

