#!/usr/bin/env python3
"""
发布脚本：将打包好的 exe 自动发布到 GitHub 和 Gitee Release

用法：
    python scripts/publish_release.py [--github-only] [--gitee-only] [--dry-run]

环境变量（可选）：
    GITEE_ACCESS_TOKEN  - Gitee 个人访问令牌
    GITHUB_TOKEN        - GitHub Personal Access Token（需要 repo 权限）
"""

import os
import sys
import json
import subprocess
import shutil
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
from datetime import datetime

# ──────────────────────────── 仓库配置 ────────────────────────────
GITHUB_OWNER = "guoshuaipeng"
GITHUB_REPO  = "db-ai-pro"
GITEE_OWNER  = "CodeYG"
GITEE_REPO   = "db-ai-pro"

PROJECT_ROOT   = Path(__file__).parent.parent
EXE_PATH       = PROJECT_ROOT / "dist" / "DataAI.exe"
VERSION_FILE   = PROJECT_ROOT / "VERSION.txt"
TOKEN_CACHE    = PROJECT_ROOT / ".release_token"         # Gitee token 缓存
GH_TOKEN_CACHE = PROJECT_ROOT / ".release_github_token"  # GitHub token 缓存

# ──────────────────────────── 工具函数 ────────────────────────────

def print_banner():
    print("=" * 55)
    print("  DataAI Release Publisher")
    print("  发布到 GitHub + Gitee Release")
    print("=" * 55)
    print()


def print_step(step: str):
    print(f"\n>>> {step}")
    print("-" * 45)


def read_version() -> str:
    """从 VERSION.txt 读取版本号"""
    if VERSION_FILE.exists():
        first_line = VERSION_FILE.read_text(encoding="utf-8").splitlines()[0].strip()
        if first_line:
            return first_line
    import re
    pyproject = PROJECT_ROOT / "pyproject.toml"
    if pyproject.exists():
        content = pyproject.read_text(encoding="utf-8")
        m = re.search(r'^version\s*=\s*"([^"]+)"', content, re.MULTILINE)
        if m:
            return m.group(1)
    return datetime.now().strftime("%Y.%m.%d.%H%M")


def get_gitee_token() -> str:
    """获取 Gitee Token：环境变量 > 本地缓存 > 交互输入"""
    token = os.environ.get("GITEE_ACCESS_TOKEN", "").strip()
    if token:
        print("[Gitee Token] 来自环境变量 GITEE_ACCESS_TOKEN")
        return token
    if TOKEN_CACHE.exists():
        token = TOKEN_CACHE.read_text(encoding="utf-8").strip()
        if token:
            print(f"[Gitee Token] 来自本地缓存")
            return token
    print()
    print("请输入 Gitee 个人访问令牌（Token）")
    print("获取地址：https://gitee.com/profile/personal_access_tokens  需要 projects 权限")
    token = input("Gitee Token: ").strip()
    if not token:
        raise ValueError("Gitee Token 不能为空")
    save = input("是否保存 Token 到本地（下次无需再输入）? [Y/n]: ").strip().lower()
    if save in ("", "y", "yes"):
        TOKEN_CACHE.write_text(token, encoding="utf-8")
        print(f"[INFO] Token 已保存（请勿提交到 git）")
    return token


def get_github_token() -> str:
    """获取 GitHub Token：环境变量 > 本地缓存 > 交互输入"""
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if token:
        print("[GitHub Token] 来自环境变量 GITHUB_TOKEN")
        return token
    if GH_TOKEN_CACHE.exists():
        token = GH_TOKEN_CACHE.read_text(encoding="utf-8").strip()
        if token:
            print("[GitHub Token] 来自本地缓存")
            return token
    print()
    print("请输入 GitHub Personal Access Token")
    print("获取地址：https://github.com/settings/tokens  需要 repo 权限")
    token = input("GitHub Token: ").strip()
    if not token:
        raise ValueError("GitHub Token 不能为空")
    save = input("是否保存 Token 到本地（下次无需再输入）? [Y/n]: ").strip().lower()
    if save in ("", "y", "yes"):
        GH_TOKEN_CACHE.write_text(token, encoding="utf-8")
        print(f"[INFO] Token 已保存（请勿提交到 git）")
    return token


# ──────────────────────────── GitHub REST API ─────────────────────

def github_api(method: str, path: str, data: dict = None, token: str = "") -> dict:
    """调用 GitHub REST API（JSON）"""
    url = f"https://api.github.com{path}"
    payload = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(
        url,
        data=payload,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "DataAI-Publisher/1.0",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API 错误 {e.code}: {body}") from e


def upload_asset_to_github(upload_url_template: str, file_path: Path, token: str):
    """上传 exe 到 GitHub Release（流式上传，避免超时）"""
    import requests as req_lib

    base_url = upload_url_template.split("{")[0]
    url = f"{base_url}?name={urllib.parse.quote(file_path.name)}"
    file_size = file_path.stat().st_size
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/octet-stream",
        "Content-Length": str(file_size),
        "User-Agent": "DataAI-Publisher/1.0",
    }
    with open(file_path, "rb") as f:
        resp = req_lib.post(url, data=f, headers=headers, timeout=600)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"GitHub 上传文件失败 {resp.status_code}: {resp.text}")
    return resp.json()


# ──────────────────────────── Gitee REST API ──────────────────────

def gitee_api_post(path: str, data: dict, token: str) -> dict:
    """调用 Gitee REST API（POST/JSON）"""
    url = f"https://gitee.com/api/v5{path}"
    data["access_token"] = token
    payload = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        url, data=payload, method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "DataAI-Publisher/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gitee API 错误 {e.code}: {body}") from e


def gitee_api_get(path: str, token: str) -> list:
    """调用 Gitee REST API（GET）"""
    url = f"https://gitee.com/api/v5{path}?access_token={token}&limit=10"
    req = urllib.request.Request(url, headers={"User-Agent": "DataAI-Publisher/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gitee API 错误 {e.code}: {body}") from e


def upload_asset_to_gitee(release_id: int, file_path: Path, token: str):
    """上传文件到 Gitee Release（multipart/form-data）"""
    import uuid
    boundary = uuid.uuid4().hex
    filename  = file_path.name

    body_parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"access_token\"\r\n\r\n{token}\r\n".encode(),
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f"Content-Type: application/octet-stream\r\n\r\n"
        ).encode("utf-8"),
        file_path.read_bytes(),
        f"\r\n--{boundary}--\r\n".encode(),
    ]
    payload = b"".join(body_parts)
    url = f"https://gitee.com/api/v5/repos/{GITEE_OWNER}/{GITEE_REPO}/releases/{release_id}/attach_files"
    req = urllib.request.Request(
        url, data=payload, method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "User-Agent": "DataAI-Publisher/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gitee 上传文件失败 {e.code}: {body}") from e


# ──────────────────────────── 发布逻辑 ────────────────────────────

def publish_github(version: str, release_notes: str, exe_path: Path,
                   token: str, dry_run: bool = False) -> bool:
    print_step("发布到 GitHub Release")

    tag   = f"v{version}"
    title = f"DataAI {version}"

    if dry_run:
        print(f"[DRY-RUN] tag={tag}  title={title}  file={exe_path.name}")
        return True

    # 1. 推送 tag
    print(f"[1/3] 推送 tag {tag} 到 GitHub ...")
    subprocess.run(["git", "tag", "-f", tag, "-m", f"Release {version}"],
                   cwd=str(PROJECT_ROOT), capture_output=True)
    push = subprocess.run(
        ["git", "push", "github", tag, "--force"],
        cwd=str(PROJECT_ROOT), capture_output=True, text=True, encoding="utf-8"
    )
    if push.returncode != 0:
        print(f"[WARN] 推送 tag 失败（可能已存在）: {push.stderr.strip()}")

    # 2. 创建 Release
    print(f"[2/3] 创建 GitHub Release ...")
    try:
        release = github_api(
            "POST",
            f"/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases",
            data={
                "tag_name": tag,
                "name": title,
                "body": release_notes,
                "draft": False,
                "prerelease": False,
            },
            token=token,
        )
        upload_url = release["upload_url"]
        release_html = release.get("html_url", "")
        print(f"[OK] Release 创建成功")
    except RuntimeError as e:
        if "422" in str(e) or "already_exists" in str(e):
            print("[WARN] Release 已存在，尝试获取 upload_url ...")
            try:
                existing = github_api(
                    "GET",
                    f"/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/tags/{tag}",
                    token=token,
                )
                upload_url   = existing["upload_url"]
                release_html = existing.get("html_url", "")
            except RuntimeError as inner:
                print(f"[ERROR] 获取已有 Release 失败: {inner}")
                return False
        else:
            print(f"[ERROR] 创建 GitHub Release 失败: {e}")
            return False

    # 3. 上传 exe
    print(f"[3/3] 上传 {exe_path.name}（{exe_path.stat().st_size / 1024 / 1024:.1f} MB）...")
    try:
        upload_asset_to_github(upload_url, exe_path, token)
        print(f"[OK] GitHub Release 发布成功！")
        print(f"     链接: {release_html or f'https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/releases/tag/{tag}'}")
        return True
    except RuntimeError as e:
        print(f"[ERROR] 上传失败: {e}")
        return False


def publish_gitee(version: str, release_notes: str, exe_path: Path,
                  token: str, dry_run: bool = False) -> bool:
    print_step("发布到 Gitee Release")

    tag   = f"v{version}"
    title = f"DataAI {version}"

    if dry_run:
        print(f"[DRY-RUN] tag={tag}  title={title}  file={exe_path.name}")
        return True

    # 1. 推送 tag 到 Gitee
    print(f"[1/3] 推送 tag {tag} 到 Gitee ...")
    subprocess.run(["git", "tag", "-f", tag, "-m", f"Release {version}"],
                   cwd=str(PROJECT_ROOT), capture_output=True)
    push = subprocess.run(
        ["git", "push", "origin", tag, "--force"],
        cwd=str(PROJECT_ROOT), capture_output=True, text=True, encoding="utf-8"
    )
    if push.returncode != 0:
        print(f"[WARN] 推送 tag 失败（可能已存在）: {push.stderr.strip()}")

    # 2. 创建 Release（若已存在则获取已有的）
    print(f"[2/3] 创建 Gitee Release ...")
    release_id = None
    try:
        resp = gitee_api_post(
            f"/repos/{GITEE_OWNER}/{GITEE_REPO}/releases",
            data={
                "tag_name": tag,
                "name": title,
                "body": release_notes,
                "prerelease": False,
                "target_commitish": "master",
            },
            token=token,
        )
        release_id = resp.get("id")
        print(f"[OK] Release 创建成功，ID: {release_id}")
    except RuntimeError as e:
        # 400/422 均可能表示 tag 已被占用或 Release 已存在
        if "400" in str(e) or "422" in str(e):
            print("[WARN] Release 已存在，获取已有 Release ...")
            try:
                releases = gitee_api_get(
                    f"/repos/{GITEE_OWNER}/{GITEE_REPO}/releases", token
                )
                release_id = next(
                    (r["id"] for r in releases if r.get("tag_name") == tag), None
                )
                if release_id:
                    print(f"[OK] 找到已有 Release，ID: {release_id}（将追加文件）")
                else:
                    print("[ERROR] 未找到已有 Release")
                    return False
            except Exception as inner:
                print(f"[ERROR] 获取 Gitee Release 失败: {inner}")
                return False
        else:
            print(f"[ERROR] 创建 Gitee Release 失败: {e}")
            return False

    # 3. 上传 exe
    print(f"[3/3] 上传 {exe_path.name}（{exe_path.stat().st_size / 1024 / 1024:.1f} MB）...")
    try:
        upload_asset_to_gitee(release_id, exe_path, token)
        print(f"[OK] Gitee Release 发布成功！")
        print(f"     链接: https://gitee.com/{GITEE_OWNER}/{GITEE_REPO}/releases/tag/{tag}")
        return True
    except RuntimeError as e:
        print(f"[ERROR] 上传失败: {e}")
        return False


# ──────────────────────────── 入口 ────────────────────────────────

def parse_args():
    """解析命令行参数"""
    import argparse
    parser = argparse.ArgumentParser(description="DataAI Release Publisher")
    parser.add_argument("--github-only", action="store_true", help="仅发布到 GitHub")
    parser.add_argument("--gitee-only",  action="store_true", help="仅发布到 Gitee")
    parser.add_argument("--dry-run",     action="store_true", help="预演模式，不实际发布")
    parser.add_argument("--notes",       type=str, default="",  help="发布说明（跳过交互输入）")
    parser.add_argument("--github-token", type=str, default="", help="GitHub Token（优先于环境变量）")
    parser.add_argument("--gitee-token",  type=str, default="", help="Gitee Token（优先于环境变量）")
    parser.add_argument("--no-pause",    action="store_true", help="结束后不暂停（适合自动化调用）")
    return parser.parse_args()


def main():
    args = parse_args()

    # 将命令行 token 写入环境变量，供 get_xxx_token() 优先读取
    if args.github_token:
        os.environ["GITHUB_TOKEN"] = args.github_token
    if args.gitee_token:
        os.environ["GITEE_ACCESS_TOKEN"] = args.gitee_token

    print_banner()

    if not EXE_PATH.exists():
        print(f"[ERROR] 未找到打包文件: {EXE_PATH}")
        print("        请先运行「📦 打包」任务生成 exe 后再发布。")
        sys.exit(1)

    version  = read_version()
    exe_size = EXE_PATH.stat().st_size / 1024 / 1024

    print(f"  版本号 : {version}")
    print(f"  文件   : {EXE_PATH.name}  ({exe_size:.1f} MB)")
    print(f"  GitHub : https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}")
    print(f"  Gitee  : https://gitee.com/{GITEE_OWNER}/{GITEE_REPO}")
    if args.dry_run:
        print(f"  模式   : DRY-RUN（不会实际发布）")

    # 发布说明：命令行参数 > 交互输入 > 默认模板
    release_notes = args.notes.strip()
    if not release_notes:
        try:
            print()
            print("请输入本次发布说明（直接回车使用默认内容）：")
            release_notes = input("发布说明: ").strip()
        except EOFError:
            release_notes = ""
    if not release_notes:
        release_notes = (
            f"## DataAI {version}\n\n"
            f"### 下载\n"
            f"- `DataAI.exe` — Windows 64位，下载后直接运行，无需安装\n\n"
            f"### 使用说明\n"
            f"- 首次运行需在设置中配置 AI 接口信息\n"
            f"- 如遇 DLL 缺失，请安装 [Visual C++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe)\n"
        )

    results = {}

    if not args.gitee_only:
        try:
            gh_token = get_github_token()
            results["GitHub"] = publish_github(version, release_notes, EXE_PATH, gh_token, args.dry_run)
        except (ValueError, KeyboardInterrupt, EOFError) as e:
            print(f"\n[SKIP] GitHub 发布已跳过: {e}")
            results["GitHub"] = False

    if not args.github_only:
        try:
            gt_token = get_gitee_token()
            results["Gitee"] = publish_gitee(version, release_notes, EXE_PATH, gt_token, args.dry_run)
        except (ValueError, KeyboardInterrupt, EOFError) as e:
            print(f"\n[SKIP] Gitee 发布已跳过: {e}")
            results["Gitee"] = False

    print()
    print("=" * 55)
    print("  发布结果汇总")
    print("=" * 55)
    for platform, ok in results.items():
        status = "[OK]  成功" if ok else "[!!] 失败/跳过"
        print(f"  {platform:<10}: {status}")
    if results and all(results.values()):
        print("\n  *** 全部发布成功！***")
    print()

    if not args.dry_run and not args.no_pause:
        try:
            input("按 Enter 关闭...")
        except EOFError:
            pass


if __name__ == "__main__":
    main()
