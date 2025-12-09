"""
连接管理处理器
"""
from PyQt6.QtWidgets import QMessageBox, QDialog
from typing import TYPE_CHECKING
import logging

from src.core.database_connection import DatabaseConnection
from src.gui.dialogs.connection_dialog import ConnectionDialog
from src.gui.dialogs.import_dialog import ImportDialog
from src.gui.workers.connection_test_worker import ConnectionTestWorker

if TYPE_CHECKING:
    from src.gui.main_window import MainWindow

logger = logging.getLogger(__name__)


class ConnectionHandler:
    """连接管理处理器"""
    
    def __init__(self, main_window: 'MainWindow'):
        self.main_window = main_window
    
    def add_connection(self):
        """添加数据库连接"""
        dialog = ConnectionDialog(self.main_window)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            connection = dialog.get_connection()
            # 使用后台线程测试连接，避免阻塞UI
            self._test_and_add_connection(connection, is_edit=False)
    
    def import_from_navicat(self):
        """从 Navicat 导入连接"""
        dialog = ImportDialog(self.main_window)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            selected_connections = dialog.get_selected_connections()
            
            if not selected_connections:
                QMessageBox.information(self.main_window, "提示", "未选择任何连接")
                return
            
            # 导入选中的连接（不测试连接，因为密码可能无法解密）
            success_count = 0
            
            for conn in selected_connections:
                # 导入时不测试连接
                if self.main_window.db_manager.add_connection(conn, test_connection=False):
                    success_count += 1
            
            # 刷新连接列表
            self.main_window.refresh_connections()
            
            # 保存连接
            if success_count > 0:
                self.save_connections()
            
            # 显示结果和提示
            if success_count > 0:
                QMessageBox.information(
                    self.main_window, 
                    "导入成功", 
                    f"成功导入 {success_count} 个数据库连接\n\n"
                    "注意：导入的连接未测试，密码可能需要手动输入。\n"
                    "您可以在连接列表中右键点击连接进行编辑。",
                    QMessageBox.StandardButton.Ok
                )
            else:
                QMessageBox.warning(
                    self.main_window,
                    "导入失败",
                    "未能导入任何连接"
                )
    
    def edit_connection(self, connection_id: str):
        """编辑数据库连接"""
        connection = self.main_window.db_manager.get_connection(connection_id)
        if not connection:
            return
        
        dialog = ConnectionDialog(self.main_window, connection)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            new_connection = dialog.get_connection()
            # 保存旧连接ID，用于移除
            self.main_window._editing_connection_id = connection_id
            # 使用后台线程测试连接，避免阻塞UI
            self._test_and_add_connection(new_connection, is_edit=True)
    
    def _test_and_add_connection(self, connection: DatabaseConnection, is_edit: bool = False):
        """在后台线程中测试连接，然后添加连接"""
        # 如果已有测试线程在运行，先停止
        if self.main_window.connection_test_worker and self.main_window.connection_test_worker.isRunning():
            self.main_window.connection_test_worker.stop()
            self.main_window.connection_test_worker.wait(2000)
            if self.main_window.connection_test_worker.isRunning():
                self.main_window.connection_test_worker.terminate()
                self.main_window.connection_test_worker.wait(500)
            self.main_window.connection_test_worker.deleteLater()
        
        # 保存连接信息，用于测试完成后的回调
        self.main_window._pending_connection = connection
        self.main_window._pending_is_edit = is_edit
        if is_edit:
            self.main_window._editing_connection_id = getattr(self.main_window, '_editing_connection_id', None)
        
        # 显示测试中的提示
        self.main_window.statusBar().showMessage("正在测试连接...")
        
        # 创建并启动连接测试线程
        self.main_window.connection_test_worker = ConnectionTestWorker(connection)
        self.main_window.connection_test_worker.test_finished.connect(self._on_connection_test_finished)
        self.main_window.connection_test_worker.start()
    
    def _on_connection_test_finished(self, success: bool, message: str):
        """连接测试完成后的回调"""
        connection = getattr(self.main_window, '_pending_connection', None)
        is_edit = getattr(self.main_window, '_pending_is_edit', False)
        editing_connection_id = getattr(self.main_window, '_editing_connection_id', None)
        
        # 清理临时变量
        if hasattr(self.main_window, '_pending_connection'):
            delattr(self.main_window, '_pending_connection')
        if hasattr(self.main_window, '_pending_is_edit'):
            delattr(self.main_window, '_pending_is_edit')
        if hasattr(self.main_window, '_editing_connection_id'):
            delattr(self.main_window, '_editing_connection_id')
        
        if not connection:
            return
        
        if success:
            # 测试成功，添加连接
            if is_edit and editing_connection_id:
                # 编辑模式：保持原有位置，先保存原有位置
                old_index = None
                if editing_connection_id in self.main_window.db_manager.connection_order:
                    old_index = self.main_window.db_manager.connection_order.index(editing_connection_id)
                # 移除旧连接（但保留顺序信息）
                self.main_window.db_manager.remove_connection(editing_connection_id)
                # 如果连接ID改变，需要在原位置插入新ID
                if connection.id != editing_connection_id and old_index is not None:
                    # 新ID不同，需要在原位置插入
                    self.main_window.db_manager.connection_order.insert(old_index, connection.id)
                elif connection.id == editing_connection_id and old_index is not None:
                    # ID相同，恢复原位置
                    self.main_window.db_manager.connection_order.insert(old_index, connection.id)
            
            # 添加新连接（不测试，因为已经在后台测试过了）
            if self.main_window.db_manager.add_connection(connection, test_connection=False):
                self.main_window.refresh_connections()
                self.save_connections()
                self.main_window.statusBar().showMessage("连接测试成功", 3000)
                if is_edit:
                    QMessageBox.information(self.main_window, "成功", "成功更新数据库连接")
                else:
                    QMessageBox.information(self.main_window, "成功", f"成功添加数据库连接: {connection.name}")
            else:
                self.main_window.statusBar().showMessage("添加连接失败", 3000)
                QMessageBox.warning(self.main_window, "失败", "添加数据库连接失败")
        else:
            # 测试失败，询问是否仍要保存
            self.main_window.statusBar().showMessage("连接测试失败", 3000)
            reply = QMessageBox.question(
                self.main_window,
                "连接测试失败",
                f"{message}\n\n是否仍要保存连接配置？\n（您可以稍后手动测试连接）",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.Yes
            )
            
            if reply == QMessageBox.StandardButton.Yes:
                # 用户选择保存
                if is_edit and editing_connection_id:
                    # 编辑模式：保持原有位置，先保存原有位置
                    old_index = None
                    if editing_connection_id in self.main_window.db_manager.connection_order:
                        old_index = self.main_window.db_manager.connection_order.index(editing_connection_id)
                    # 移除旧连接（但保留顺序信息）
                    self.main_window.db_manager.remove_connection(editing_connection_id)
                    # 如果连接ID改变，需要在原位置插入新ID
                    if connection.id != editing_connection_id and old_index is not None:
                        # 新ID不同，需要在原位置插入
                        self.main_window.db_manager.connection_order.insert(old_index, connection.id)
                    elif connection.id == editing_connection_id and old_index is not None:
                        # ID相同，恢复原位置
                        self.main_window.db_manager.connection_order.insert(old_index, connection.id)
                
                # 保存连接（不测试）
                if self.main_window.db_manager.add_connection(connection, test_connection=False):
                    self.main_window.refresh_connections()
                    self.save_connections()
                    if is_edit:
                        QMessageBox.information(
                            self.main_window,
                            "已保存",
                            "连接配置已保存，但连接测试失败。\n请检查连接信息（特别是密码）是否正确。"
                        )
                    else:
                        QMessageBox.information(
                            self.main_window,
                            "已保存",
                            f"连接配置已保存，但连接测试失败。\n请检查连接信息（特别是密码）是否正确。"
                        )
                else:
                    QMessageBox.warning(self.main_window, "失败", "保存连接配置失败")
    
    def remove_connection(self, connection_id: str):
        """移除数据库连接"""
        connection = self.main_window.db_manager.get_connection(connection_id)
        if not connection:
            return
        
        reply = QMessageBox.question(
            self.main_window,
            "确认",
            f"确定要删除连接 '{connection.name}' 吗？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            if self.main_window.db_manager.remove_connection(connection_id):
                self.main_window.refresh_connections()
                self.save_connections()  # 保存连接
                if self.main_window.current_connection_id == connection_id:
                    self.main_window.current_connection_id = None
                    self.main_window.sql_editor.set_status("已断开连接")
    
    def save_connections(self):
        """保存所有连接"""
        try:
            connections = self.main_window.db_manager.get_all_connections()
            if not connections:
                logger.warning("连接列表为空，跳过保存以避免覆盖已有数据")
                return
            
            # 记录保存的连接数量，用于调试
            logger.info(f"准备保存 {len(connections)} 个连接")
            result = self.main_window.connection_storage.save_connections(connections)
            if not result:
                logger.error("保存连接失败")
        except Exception as e:
            logger.error(f"保存连接时发生异常: {str(e)}", exc_info=True)
    
    def test_connection(self, connection_id: str = None):
        """测试连接（使用后台线程，避免阻塞UI）"""
        if not connection_id:
            connection_id = self.main_window.current_connection_id
        
        if not connection_id:
            QMessageBox.warning(self.main_window, "警告", "请先选择一个数据库连接")
            return
        
        # 获取连接配置
        connection = self.main_window.db_manager.get_connection(connection_id)
        if not connection:
            QMessageBox.warning(self.main_window, "警告", "连接不存在")
            return
        
        # 使用后台线程测试连接，避免阻塞UI
        self._test_and_show_result(connection)
    
    def _test_and_show_result(self, connection: DatabaseConnection):
        """在后台线程中测试连接，然后显示结果"""
        # 异步停止旧的测试worker，不等待，避免阻塞UI
        if self.main_window.connection_test_worker:
            try:
                if self.main_window.connection_test_worker.isRunning():
                    # 断开信号连接，避免旧worker的回调影响新操作
                    try:
                        self.main_window.connection_test_worker.test_finished.disconnect()
                    except:
                        pass
                    # 请求停止，但不等待（异步停止）
                    self.main_window.connection_test_worker.stop()
                    # 不等待，让线程自己结束，稍后自动清理
                    self.main_window.connection_test_worker.deleteLater()
            except RuntimeError:
                pass
        
        # 显示测试中的提示
        self.main_window.statusBar().showMessage("正在测试连接...")
        
        # 创建并启动连接测试线程
        self.main_window.connection_test_worker = ConnectionTestWorker(connection)
        self.main_window.connection_test_worker.test_finished.connect(self._on_test_result_ready)
        self.main_window.connection_test_worker.start()
    
    def _on_test_result_ready(self, success: bool, message: str):
        """连接测试完成后的回调"""
        if success:
            self.main_window.statusBar().showMessage("连接测试成功", 3000)
            QMessageBox.information(self.main_window, "成功", message)
        else:
            self.main_window.statusBar().showMessage("连接测试失败", 3000)
            QMessageBox.warning(self.main_window, "失败", message)

