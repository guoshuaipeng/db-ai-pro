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
            
            # 3. 树视图缓存表 - 数据库列表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS tree_cache_databases (
                    connection_id TEXT NOT NULL,
                    database_name TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (connection_id, database_name)
                )
            """)
            
            # 4. 树视图缓存表 - 表列表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS tree_cache_tables (
                    connection_id TEXT NOT NULL,
                    database_name TEXT NOT NULL,
                    table_name TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (connection_id, database_name, table_name)
                )
            """)
            
            # 5. 应用设置表
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
                    is_default INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            
            # 检查是否需要迁移旧表结构
            cursor.execute("PRAGMA table_info(ai_models)")
            columns = [row[1] for row in cursor.fetchall()]
            
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
            
            # 创建索引
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_tree_cache_databases_connection 
                ON tree_cache_databases(connection_id)
            """)
            
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_tree_cache_tables_connection_db 
                ON tree_cache_tables(connection_id, database_name)
            """)
            
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
            # 同时清理该连接的缓存
            cursor.execute("DELETE FROM tree_cache_databases WHERE connection_id = ?", (connection_id,))
            cursor.execute("DELETE FROM tree_cache_tables WHERE connection_id = ?", (connection_id,))
            logger.debug(f"删除连接配置及缓存: {connection_id}")
    
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
    
    # ==================== 树视图缓存管理 ====================
    
    def save_databases_cache(self, connection_id: str, databases: List[str]):
        """
        保存数据库列表缓存
        
        :param connection_id: 连接ID
        :param databases: 数据库名列表
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            now = datetime.now().isoformat()
            
            # 先删除旧缓存
            cursor.execute("DELETE FROM tree_cache_databases WHERE connection_id = ?", (connection_id,))
            
            # 批量插入新缓存
            for db_name in databases:
                cursor.execute("""
                    INSERT INTO tree_cache_databases (connection_id, database_name, updated_at)
                    VALUES (?, ?, ?)
                """, (connection_id, db_name, now))
            
            logger.debug(f"保存数据库列表缓存: {connection_id}, {len(databases)} 个数据库")
    
    def get_databases_cache(self, connection_id: str) -> Optional[List[str]]:
        """
        获取数据库列表缓存
        
        :param connection_id: 连接ID
        :return: 数据库名列表，无缓存返回 None
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT database_name FROM tree_cache_databases 
                WHERE connection_id = ?
                ORDER BY database_name
            """, (connection_id,))
            rows = cursor.fetchall()
            return [row['database_name'] for row in rows] if rows else None
    
    def save_tables_cache(self, connection_id: str, database: str, tables: List[str]):
        """
        保存表列表缓存
        
        :param connection_id: 连接ID
        :param database: 数据库名
        :param tables: 表名列表
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            now = datetime.now().isoformat()
            
            # 先删除旧缓存
            cursor.execute("""
                DELETE FROM tree_cache_tables 
                WHERE connection_id = ? AND database_name = ?
            """, (connection_id, database))
            
            # 批量插入新缓存
            for table_name in tables:
                cursor.execute("""
                    INSERT INTO tree_cache_tables 
                    (connection_id, database_name, table_name, updated_at)
                    VALUES (?, ?, ?, ?)
                """, (connection_id, database, table_name, now))
            
            # 如果表列表为空，插入一个占位符来标记"已缓存"
            if not tables:
                cursor.execute("""
                    INSERT INTO tree_cache_tables 
                    (connection_id, database_name, table_name, updated_at)
                    VALUES (?, ?, ?, ?)
                """, (connection_id, database, '__EMPTY_MARKER__', now))
                logger.debug(f"💾 插入空表占位符: {connection_id}.{database}")
            
            logger.debug(f"ConfigDB 保存表列表缓存: {connection_id}.{database}, {len(tables)} 个表")
    
    def get_tables_cache(self, connection_id: str, database: str) -> Optional[List[str]]:
        """
        获取表列表缓存
        
        :param connection_id: 连接ID
        :param database: 数据库名
        :return: 表名列表，无缓存返回 None，空数据库返回 []
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT table_name FROM tree_cache_tables 
                WHERE connection_id = ? AND database_name = ?
                ORDER BY table_name
            """, (connection_id, database))
            rows = cursor.fetchall()
            
            if not rows:
                # 没有任何记录，说明从未缓存过
                return None
            
            # 过滤掉占位符，返回实际的表列表
            tables = [row['table_name'] for row in rows if row['table_name'] != '__EMPTY_MARKER__']
            return tables
    
    def clear_connection_cache(self, connection_id: str):
        """
        清除指定连接的所有缓存
        
        :param connection_id: 连接ID
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM tree_cache_databases WHERE connection_id = ?", (connection_id,))
            cursor.execute("DELETE FROM tree_cache_tables WHERE connection_id = ?", (connection_id,))
            logger.debug(f"清除连接缓存: {connection_id}")
    
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
        获取当前使用的 AI 模型配置（基于 last_used_ai_model_id）
        
        :return: 模型配置字典，不存在返回 None
        """
        # 从 settings 表获取上次使用的模型ID
        last_used_id = self.get_setting('last_used_ai_model_id', None)
        
        if last_used_id:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM ai_models WHERE id = ? AND is_active = 1", (last_used_id,))
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
                    }
        
        return None
    
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
                }
            return None
    
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
    
    def migrate_from_json(self, connections_file: str = None, prompts_file: str = None, 
                         tree_cache_file: str = None, ai_models_file: str = None):
        """
        从 JSON 文件迁移数据到 SQLite
        迁移成功后自动将 JSON 文件重命名为 .backup
        
        :param connections_file: 连接配置 JSON 文件路径
        :param prompts_file: 提示词配置 JSON 文件路径
        :param tree_cache_file: 树缓存 JSON 文件路径
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
        
        # 迁移提示词配置
        if prompts_file and os.path.exists(prompts_file):
            try:
                with open(prompts_file, 'r', encoding='utf-8') as f:
                    prompts = json.load(f)
                    for prompt_type, content in prompts.items():
                        self.save_prompt(prompt_type, content)
                        migrated_count += 1
                logger.info(f"已迁移 {len(prompts)} 个提示词配置")
                migrated_files.append(prompts_file)
            except Exception as e:
                logger.error(f"迁移提示词配置失败: {str(e)}")
        
        # 迁移树缓存
        if tree_cache_file and os.path.exists(tree_cache_file):
            try:
                with open(tree_cache_file, 'r', encoding='utf-8') as f:
                    cache_data = json.load(f)
                    for conn_id, conn_cache in cache_data.items():
                        # 迁移数据库列表
                        databases = conn_cache.get('databases', [])
                        if databases:
                            self.save_databases_cache(conn_id, databases)
                        
                        # 迁移表列表
                        tables_dict = conn_cache.get('tables', {})
                        for db_name, tables in tables_dict.items():
                            self.save_tables_cache(conn_id, db_name, tables)
                        
                        migrated_count += 1
                logger.info(f"已迁移 {len(cache_data)} 个连接的树缓存")
                migrated_files.append(tree_cache_file)
            except Exception as e:
                logger.error(f"迁移树缓存失败: {str(e)}")
        
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


# 全局实例
_config_db_instance = None


def get_config_db() -> ConfigDB:
    """获取配置数据库全局实例"""
    global _config_db_instance
    if _config_db_instance is None:
        _config_db_instance = ConfigDB()
    return _config_db_instance

