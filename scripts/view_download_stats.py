"""
查看 GitHub Releases 下载统计的脚本
"""
import requests
import sys
from typing import Optional


def get_release_stats(owner: str, repo: str, release_tag: Optional[str] = None):
    """
    获取 Release 的下载统计
    
    Args:
        owner: GitHub 用户名
        repo: 仓库名
        release_tag: 指定 Release 标签（可选，None 则获取所有 Release）
    """
    if release_tag:
        url = f"https://api.github.com/repos/{owner}/{repo}/releases/tags/{release_tag}"
        releases = [requests.get(url).json()]
    else:
        url = f"https://api.github.com/repos/{owner}/{repo}/releases"
        response = requests.get(url)
        if response.status_code != 200:
            print(f"❌ 获取 Release 列表失败: {response.status_code}")
            print(f"   错误信息: {response.text}")
            return
        releases = response.json()
    
    if not releases:
        print(f"📭 {owner}/{repo} 暂无 Release")
        return
    
    print(f"\n📊 {owner}/{repo} 下载统计\n")
    print("=" * 80)
    
    total_all = 0
    for release in releases:
        tag = release.get('tag_name', 'Unknown')
        name = release.get('name', tag)
        created = release.get('created_at', '')
        if created:
            created = created[:10]  # 只取日期部分
        
        print(f"\n📦 Release: {name} ({tag})")
        if created:
            print(f"   发布时间: {created}")
        
        assets = release.get('assets', [])
        total_release = 0
        
        if not assets:
            print("   (无安装包)")
            continue
        
        for asset in assets:
            asset_name = asset.get('name', 'Unknown')
            downloads = asset.get('download_count', 0)
            size = asset.get('size', 0)
            size_mb = size / (1024 * 1024)
            total_release += downloads
            
            if downloads > 0:
                print(f"   - {asset_name}")
                print(f"     下载次数: {downloads:,}")
                if size > 0:
                    print(f"     文件大小: {size_mb:.2f} MB")
            else:
                print(f"   - {asset_name} (0 次下载)")
        
        if total_release > 0:
            print(f"   💾 小计: {total_release:,} 次下载")
        else:
            print("   (暂无下载)")
        
        total_all += total_release
    
    print("\n" + "=" * 80)
    print(f"📈 总下载量: {total_all:,} 次下载")
    print("=" * 80)


def get_latest_release_stats(owner: str, repo: str):
    """获取最新 Release 的下载统计"""
    url = f"https://api.github.com/repos/{owner}/{repo}/releases/latest"
    response = requests.get(url)
    
    if response.status_code == 404:
        print(f"❌ {owner}/{repo} 暂无 Release")
        return
    
    if response.status_code != 200:
        print(f"❌ 获取最新 Release 失败: {response.status_code}")
        print(f"   错误信息: {response.text}")
        return
    
    release = response.json()
    tag = release.get('tag_name', 'Unknown')
    get_release_stats(owner, repo, tag)


if __name__ == "__main__":
    if len(sys.argv) >= 3:
        owner = sys.argv[1]
        repo = sys.argv[2]
        tag = sys.argv[3] if len(sys.argv) > 3 else None
        
        if tag:
            get_release_stats(owner, repo, tag)
        else:
            get_latest_release_stats(owner, repo)
    else:
        # 默认使用项目仓库
        print("使用方法:")
        print("  python scripts/view_download_stats.py <owner> <repo> [tag]")
        print("\n示例:")
        print("  python scripts/view_download_stats.py guoshuaipeng db-ai-pro")
        print("  python scripts/view_download_stats.py guoshuaipeng db-ai-pro v0.2.0")
        print("\n默认统计最新 Release:")
        get_latest_release_stats("guoshuaipeng", "db-ai-pro")
