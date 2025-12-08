"""
创建ICO文件（用于Windows任务栏）
支持从PNG生成ICO，如果Pillow可用则生成标准ICO，否则使用PyQt6
"""
from pathlib import Path
import sys


def create_ico_from_png():
    """从PNG文件创建ICO文件"""
    icon_dir = Path(__file__).parent
    png_path = icon_dir / "app_icon.png"
    ico_path = icon_dir / "app_icon.ico"
    
    if not png_path.exists():
        print(f"错误: 找不到PNG图标文件: {png_path}")
        return False
    
    print(f"正在从 {png_path} 创建ICO文件...")
    
    # 方法1: 尝试使用Pillow（推荐）
    try:
        from PIL import Image
        
        img = Image.open(png_path)
        # 创建包含多个尺寸的ICO文件（Windows需要多个尺寸以获得最佳显示效果）
        sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
        
        # 创建包含多个尺寸的图标列表
        icon_images = []
        for size in sizes:
            resized = img.resize(size, Image.Resampling.LANCZOS)
            icon_images.append(resized)
        
        # 保存为ICO文件
        img.save(ico_path, format='ICO', sizes=sizes)
        print(f"✓ ICO文件已成功创建: {ico_path}")
        print(f"  包含尺寸: {', '.join(f'{w}x{h}' for w, h in sizes)}")
        return True
        
    except ImportError:
        print("  Pillow未安装，使用PyQt6生成...")
    
    # 方法2: 使用PyQt6生成（如果Pillow不可用）
    try:
        from PyQt6.QtGui import QIcon, QPixmap, QImage
        from PyQt6.QtCore import QSize
        
        # 读取PNG文件
        pixmap = QPixmap(str(png_path))
        if pixmap.isNull():
            print("  错误: 无法加载PNG图标")
            return False
        
        # 创建包含多个尺寸的QIcon
        icon = QIcon()
        sizes = [16, 32, 48, 64, 128, 256]
        
        from PyQt6.QtCore import Qt
        
        for size in sizes:
            scaled_pixmap = pixmap.scaled(
                QSize(size, size),
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation
            )
            icon.addPixmap(scaled_pixmap)
        
        # 注意：PyQt6无法直接保存为ICO格式
        # 所以我们将256x256的版本保存，Windows应该能够使用
        largest_pixmap = pixmap.scaled(
            QSize(256, 256),
            Qt.AspectRatioMode.KeepAspectRatio,
            Qt.TransformationMode.SmoothTransformation
        )
        largest_pixmap.save(str(ico_path), 'ICO')
        
        print(f"✓ ICO文件已创建（使用PyQt6）: {ico_path}")
        print("  注意: 建议安装Pillow以获得更好的多尺寸ICO支持:")
        print("    pip install Pillow")
        return True
        
    except Exception as e:
        print(f"  使用PyQt6创建ICO失败: {e}")
        return False


def create_ico_dynamically():
    """动态创建ICO文件（如果PNG不存在）"""
    icon_dir = Path(__file__).parent
    ico_path = icon_dir / "app_icon.ico"
    
    try:
        # 尝试动态创建图标
        create_script = icon_dir / "create_app_icon.py"
        if create_script.exists():
            import importlib.util
            spec = importlib.util.spec_from_file_location("create_app_icon", create_script)
            module = importlib.util.module_from_spec(spec)
            sys.modules["create_app_icon"] = module
            spec.loader.exec_module(module)
            
            icon = module.create_app_icon()
            
            # 使用PyQt6保存（注意：这只是近似）
            from PyQt6.QtGui import QPixmap
            pixmap = icon.pixmap(256, 256)
            pixmap.save(str(ico_path), 'ICO')
            
            print(f"✓ 动态创建ICO文件: {ico_path}")
            return True
    except Exception as e:
        print(f"  动态创建ICO失败: {e}")
    
    return False


if __name__ == "__main__":
    success = False
    
    # 首先尝试从PNG创建
    if (Path(__file__).parent / "app_icon.png").exists():
        success = create_ico_from_png()
    
    # 如果失败，尝试动态创建
    if not success:
        print("\n尝试动态创建ICO...")
        success = create_ico_dynamically()
    
    if not success:
        print("\n错误: 无法创建ICO文件")
        print("请确保存在 app_icon.png 文件，或安装Pillow库")
        sys.exit(1)
    
    sys.exit(0)
