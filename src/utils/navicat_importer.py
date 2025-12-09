"""
Navicat 连接导入器
"""
import os
import json
import base64
from pathlib import Path
from typing import List, Dict, Optional
import logging
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

from src.core.database_connection import DatabaseConnection, DatabaseType

logger = logging.getLogger(__name__)


class NavicatImporter:
    """Navicat 连接导入器"""
    
    # Navicat 默认密钥（不同版本可能不同）
    NAVICAT_KEY = b"3AF5F9F8E7D6C5B4A392817263548596"
    
    def __init__(self):
        self.navicat_paths = self._get_navicat_paths()
    
    def _get_navicat_paths(self) -> List[Path]:
        """获取 Navicat 配置文件路径"""
        paths = []
        
        # Windows 路径
        if os.name == 'nt':
            appdata = os.getenv('APPDATA')
            if appdata:
                # Navicat Premium
                premium_path = Path(appdata) / "PremiumSoft" / "NavicatPremium"
                if premium_path.exists():
                    paths.append(premium_path)
                
                # Navicat for MySQL
                mysql_path = Path(appdata) / "PremiumSoft" / "Navicat"
                if mysql_path.exists():
                    paths.append(mysql_path)
        
        # macOS 路径
        elif os.name == 'posix':
            home = Path.home()
            # Navicat Premium
            premium_path = home / "Library" / "Preferences" / "com.prect.NavicatPremium"
            if premium_path.exists():
                paths.append(premium_path)
            
            # Navicat for MySQL
            mysql_path = home / "Library" / "Preferences" / "com.prect.Navicat"
            if mysql_path.exists():
                paths.append(mysql_path)
        
        return paths
    
    def _decrypt_navicat_password(self, encrypted: str) -> str:
        """解密 Navicat 密码"""
        if not encrypted:
            return ""
        
        try:
            # Navicat 使用 AES-128-CBC 加密
            encrypted_bytes = base64.b64decode(encrypted)
            
            if len(encrypted_bytes) < 16:
                logger.warning("加密数据长度不足")
                return ""
            
            # 提取 IV 和密文
            iv = encrypted_bytes[:16]
            ciphertext = encrypted_bytes[16:]
            
            if len(ciphertext) == 0:
                return ""
            
            # 创建解密器
            cipher = Cipher(
                algorithms.AES(self.NAVICAT_KEY[:16]),
                modes.CBC(iv),
                backend=default_backend()
            )
            decryptor = cipher.decryptor()
            
            # 解密
            decrypted = decryptor.update(ciphertext) + decryptor.finalize()
            
            # 移除填充
            if len(decrypted) > 0:
                padding = decrypted[-1]
                if padding <= 16:  # 验证填充值
                    decrypted = decrypted[:-padding]
                
                return decrypted.decode('utf-8', errors='ignore')
            
            return ""
            
        except base64.binascii.Error:
            # 如果不是 base64 编码，可能是明文
            logger.info("密码可能未加密，直接返回")
            return encrypted
        except Exception as e:
            logger.error(f"解密密码失败: {str(e)}")
            # 如果解密失败，返回空字符串，用户需要手动输入密码
            return ""
    
    def _parse_navicat_connection(self, conn_data: Dict) -> Optional[DatabaseConnection]:
        """解析 Navicat 连接数据"""
        try:
            from pydantic import SecretStr
            
            # 获取连接信息（尝试多种可能的键名）
            name = (
                conn_data.get("ConnectionName") or 
                conn_data.get("Name") or 
                conn_data.get("name") or
                ""
            )
            
            # 获取主机地址（重要！尝试多种可能的键名）
            host = (
                conn_data.get("Host") or 
                conn_data.get("host") or 
                conn_data.get("HostName") or
                conn_data.get("hostname") or
                conn_data.get("Server") or
                conn_data.get("server") or
                conn_data.get("Address") or
                conn_data.get("address") or
                "localhost"  # 默认值
            )
            
            # 如果 host 仍然是 localhost，尝试从原始数据中查找
            if host == "localhost":
                for key, value in conn_data.items():
                    key_lower = key.lower()
                    if value and isinstance(value, str) and value != "localhost":
                        if key_lower in ['host', 'hostname', 'server', 'address', 'ip']:
                            host = value
                            break
                        # 如果值看起来像 IP 地址或主机名
                        elif '.' in value and not value.replace('.', '').isdigit():
                            if len(value.split('.')) >= 2:
                                host = value
                                break
            
            # 获取端口
            port_str = (
                conn_data.get("Port") or 
                conn_data.get("port") or 
                conn_data.get("PortNumber") or
                "3306"
            )
            try:
                port = int(port_str)
            except (ValueError, TypeError):
                port = 3306
            
            # 获取数据库名
            database = (
                conn_data.get("DatabaseName") or 
                conn_data.get("Database") or 
                conn_data.get("database") or
                conn_data.get("DBName") or
                conn_data.get("dbname") or
                ""
            )
            
            # 获取用户名
            username = (
                conn_data.get("UserName") or 
                conn_data.get("User") or 
                conn_data.get("username") or
                conn_data.get("user") or
                conn_data.get("Username") or
                ""
            )
            
            # 解密密码（如果失败，留空让用户手动输入）
            encrypted_password = conn_data.get("Password", "")
            if encrypted_password:
                password = self._decrypt_navicat_password(encrypted_password)
                # 如果解密失败，使用原始值（可能是明文）
                if not password and encrypted_password:
                    password = encrypted_password
            else:
                password = ""
            
            # 判断数据库类型
            db_type_str = conn_data.get("Type", "MySQL").lower()
            db_type_map = {
                "mysql": DatabaseType.MYSQL,
                "mariadb": DatabaseType.MARIADB,
                "postgresql": DatabaseType.POSTGRESQL,
                "oracle": DatabaseType.ORACLE,
                "sqlserver": DatabaseType.SQLSERVER,
                "sqlite": DatabaseType.SQLITE,
                "hive": DatabaseType.HIVE,
            }
            db_type = db_type_map.get(db_type_str, DatabaseType.MYSQL)
            
            # 创建连接对象
            connection = DatabaseConnection(
                name=name or f"{db_type.value}_{host}_{database}",
                db_type=db_type,
                host=host,
                port=port,
                database=database,
                username=username,
                password=SecretStr(password),
                charset=conn_data.get("Charset", "utf8mb4"),
                use_ssl=conn_data.get("SSL", False),
            )
            
            return connection
            
        except Exception as e:
            logger.error(f"解析连接失败: {str(e)}")
            return None
    
    def import_from_registry(self) -> List[DatabaseConnection]:
        """从 Windows 注册表导入（如果可用）"""
        connections = []
        
        if os.name != 'nt':
            return connections
        
        try:
            import winreg
            
            # Navicat 注册表路径
            reg_paths = [
                r"SOFTWARE\PremiumSoft\NavicatPremium\Servers",
                r"SOFTWARE\PremiumSoft\Navicat\Servers",
            ]
            
            for reg_path in reg_paths:
                try:
                    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, reg_path)
                    
                    # 遍历所有服务器
                    i = 0
                    while True:
                        try:
                            server_name = winreg.EnumKey(key, i)
                            server_key = winreg.OpenKey(key, server_name)
                            
                            # 读取连接信息
                            conn_data = {}
                            j = 0
                            while True:
                                try:
                                    name, value, _ = winreg.EnumValue(server_key, j)
                                    conn_data[name] = value
                                    j += 1
                                except OSError:
                                    break
                            
                            winreg.CloseKey(server_key)
                            
                            # 解析连接
                            connection = self._parse_navicat_connection(conn_data)
                            if connection:
                                connections.append(connection)
                            
                            i += 1
                        except OSError:
                            break
                    
                    winreg.CloseKey(key)
                    
                except FileNotFoundError:
                    continue
                    
        except ImportError:
            logger.warning("无法导入 winreg 模块")
        except Exception as e:
            logger.error(f"从注册表导入失败: {str(e)}")
        
        return connections
    
    def import_from_config_file(self, config_path: Path) -> List[DatabaseConnection]:
        """从配置文件导入"""
        connections = []
        
        if not config_path.exists():
            return connections
        
        try:
            # 处理 .ncx 文件（Navicat 连接导出文件）
            if config_path.suffix.lower() == '.ncx':
                connections.extend(self._parse_ncx_file(config_path))
            
            # 尝试读取 JSON 格式
            elif config_path.suffix == '.json':
                with open(config_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    
                    if isinstance(data, list):
                        for item in data:
                            conn = self._parse_navicat_connection(item)
                            if conn:
                                connections.append(conn)
                    elif isinstance(data, dict):
                        # 可能是包含连接列表的对象
                        for key, value in data.items():
                            if isinstance(value, dict):
                                conn = self._parse_navicat_connection(value)
                                if conn:
                                    connections.append(conn)
            
            # 尝试读取 XML 格式
            elif config_path.suffix in ['.xml', '.ncx']:
                connections.extend(self._parse_xml_file(config_path))
        
        except Exception as e:
            logger.error(f"从配置文件导入失败: {str(e)}")
        
        return connections
    
    def _parse_ncx_file(self, ncx_path: Path) -> List[DatabaseConnection]:
        """解析 .ncx 文件（Navicat 连接导出文件）"""
        connections = []
        
        try:
            import xml.etree.ElementTree as ET
            
            tree = ET.parse(ncx_path)
            root = tree.getroot()
            
            # 打印根元素信息用于调试
            logger.info(f"XML 根元素: {root.tag}")
            
            # 打印前几个节点的结构用于调试
            import xml.etree.ElementTree as ET
            xml_str = ET.tostring(root, encoding='unicode')[:500]  # 前500个字符
            logger.debug(f"XML 内容预览: {xml_str}...")
            
            # Navicat .ncx 文件可能有不同的结构
            # 尝试多种可能的节点路径
            connection_nodes = []
            
            # 方式1: 直接查找 Connection 节点
            connection_nodes.extend(root.findall('.//Connection'))
            
            # 方式2: 查找 Connections/Connection
            if not connection_nodes:
                connections_elem = root.find('Connections')
                if connections_elem is not None:
                    connection_nodes.extend(connections_elem.findall('Connection'))
            
            # 方式3: 查找所有可能的连接节点
            if not connection_nodes:
                # 尝试查找所有可能包含连接信息的节点
                for elem in root.iter():
                    if 'connection' in elem.tag.lower() or 'server' in elem.tag.lower():
                        connection_nodes.append(elem)
            
            logger.debug(f"找到 {len(connection_nodes)} 个连接节点")
            
            # 解析每个连接节点
            for conn_elem in connection_nodes:
                conn_data = {}
                
                # 遍历所有子元素和属性
                for child in conn_elem:
                    tag = child.tag
                    # 移除命名空间前缀（如果有）
                    if '}' in tag:
                        tag = tag.split('}')[1]
                    
                    text = child.text.strip() if child.text else ""
                    
                    # 保存原始标签和值用于调试
                    conn_data[tag] = text
                    
                    # 标准化标签名
                    tag_lower = tag.lower()
                    
                    # 处理连接名称
                    if tag_lower in ['connectionname', 'name', 'connection_name']:
                        conn_data['ConnectionName'] = text
                    # 处理数据库类型
                    elif tag_lower in ['type', 'databasetype', 'database_type', 'dbtype']:
                        conn_data['Type'] = text
                    # 处理主机地址（重要！）
                    elif tag_lower in ['host', 'hostname', 'server', 'address', 'ip']:
                        if not conn_data.get('Host') or conn_data.get('Host') == 'localhost':
                            conn_data['Host'] = text
                    # 处理端口
                    elif tag_lower in ['port', 'portnumber']:
                        conn_data['Port'] = text
                    # 处理数据库名
                    elif tag_lower in ['databasename', 'database', 'dbname', 'db']:
                        conn_data['DatabaseName'] = text
                    # 处理用户名
                    elif tag_lower in ['username', 'user', 'user_name', 'login']:
                        conn_data['UserName'] = text
                    # 处理密码
                    elif tag_lower in ['password', 'pass', 'passwd', 'pwd']:
                        conn_data['Password'] = text
                    # 处理字符集
                    elif tag_lower in ['charset', 'characterset', 'encoding']:
                        conn_data['Charset'] = text
                    # 处理SSL
                    elif tag_lower in ['ssl', 'usessl', 'use_ssl', 'ssl_enabled']:
                        conn_data['SSL'] = text.lower() in ['true', '1', 'yes', 'enabled']
                
                # 也检查属性
                for attr_name, attr_value in conn_elem.attrib.items():
                    attr_lower = attr_name.lower()
                    if attr_lower in ['host', 'hostname', 'server']:
                        if not conn_data.get('Host') or conn_data.get('Host') == 'localhost':
                            conn_data['Host'] = attr_value
                    elif attr_lower in ['port']:
                        conn_data['Port'] = attr_value
                    elif attr_lower in ['name', 'connectionname']:
                        conn_data['ConnectionName'] = attr_value
                
                # 调试：打印解析到的数据
                logger.debug(f"解析到的连接数据: {conn_data}")
                
                # 确保 Host 不是 localhost（如果找到了其他值）
                if conn_data.get('Host') == 'localhost' and len(conn_data) > 1:
                    # 尝试从其他字段推断
                    for key, value in conn_data.items():
                        if key.lower() not in ['host', 'connectionname', 'type'] and value:
                            # 可能是 IP 地址或主机名
                            if '.' in str(value) and not value.isdigit():
                                # 可能是主机地址
                                if not any(c.isalpha() for c in str(value)) or len(str(value).split('.')) == 4:
                                    logger.debug(f"从字段 {key} 推断主机地址: {value}")
                                    conn_data['Host'] = value
                                    break
                
                # 解析连接
                conn = self._parse_navicat_connection(conn_data)
                if conn:
                    connections.append(conn)
                    logger.info(f"成功解析连接: {conn.name} - {conn.host}:{conn.port}")
                else:
                    logger.warning(f"解析连接失败，数据: {conn_data}")
        
        except Exception as e:
            logger.error(f"解析 .ncx 文件失败: {str(e)}", exc_info=True)
        
        return connections
    
    def _parse_xml_file(self, xml_path: Path) -> List[DatabaseConnection]:
        """解析通用 XML 文件"""
        connections = []
        
        try:
            import xml.etree.ElementTree as ET
            tree = ET.parse(xml_path)
            root = tree.getroot()
            
            # 根据实际 XML 结构解析
            for conn_elem in root.findall('.//Connection'):
                conn_data = {}
                for child in conn_elem:
                    conn_data[child.tag] = child.text if child.text else ""
                
                conn = self._parse_navicat_connection(conn_data)
                if conn:
                    connections.append(conn)
        
        except Exception as e:
            logger.error(f"解析 XML 文件失败: {str(e)}")
        
        return connections
    
    def import_from_navicat(self) -> List[DatabaseConnection]:
        """自动从 Navicat 导入所有连接"""
        connections = []
        
        # 1. 尝试从注册表导入（Windows）
        if os.name == 'nt':
            registry_conns = self.import_from_registry()
            connections.extend(registry_conns)
        
        # 2. 尝试从配置文件导入
        for navicat_path in self.navicat_paths:
            # 查找可能的配置文件（包括 .ncx 文件）
            config_files = (
                list(navicat_path.glob("*.json")) + 
                list(navicat_path.glob("*.xml")) +
                list(navicat_path.glob("*.ncx"))
            )
            
            for config_file in config_files:
                file_conns = self.import_from_config_file(config_file)
                connections.extend(file_conns)
        
        # 去重（基于名称和连接信息）
        unique_connections = []
        seen = set()
        
        for conn in connections:
            key = (conn.name, conn.host, conn.port, conn.database)
            if key not in seen:
                seen.add(key)
                unique_connections.append(conn)
        
        return unique_connections
    
    def import_from_file(self, file_path: str) -> List[DatabaseConnection]:
        """从指定文件导入连接"""
        config_path = Path(file_path)
        return self.import_from_config_file(config_path)
    
    def debug_ncx_structure(self, ncx_path: Path) -> str:
        """调试：打印 .ncx 文件的结构"""
        try:
            import xml.etree.ElementTree as ET
            
            tree = ET.parse(ncx_path)
            root = tree.getroot()
            
            result = []
            result.append(f"根元素: {root.tag}")
            result.append(f"属性: {root.attrib}")
            result.append("\n所有元素:")
            
            def print_element(elem, indent=0):
                indent_str = "  " * indent
                result.append(f"{indent_str}{elem.tag}: {elem.text if elem.text else ''} {elem.attrib}")
                for child in elem:
                    print_element(child, indent + 1)
            
            print_element(root)
            
            return "\n".join(result)
        
        except Exception as e:
            return f"解析失败: {str(e)}"

