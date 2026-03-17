"""
使用 Gitee OpenAPI 为 CodeYG/db-ai-pro 创建带推荐文案的 Release。

依赖：
- 环境变量 GITEE_TOKEN：Gitee 个人访问令牌，需具备 repo / projects 权限。

用法（在 PowerShell 中）：

    cd e:\pythonProjects\db-ai
    python scripts\publish_gitee_release_post.py

行为：
- 自动读取项目根目录下的 VERSION.txt 作为版本号（例如：1.2.3）；
- 使用 tag 名：v<版本号>（如 v1.2.3），在 Gitee 上创建对应 Release；
- 附带一段推荐 DataAI 的 Release 正文。
"""

import argparse
import os
import sys
from pathlib import Path
from textwrap import dedent

import requests


GITEE_API_BASE = "https://gitee.com/api/v5"
DEFAULT_OWNER = "CodeYG"
DEFAULT_REPO = "db-ai-pro"


def read_version(version_file: Path) -> str:
    if not version_file.exists():
        raise FileNotFoundError(f"未找到版本文件: {version_file}")
    text = version_file.read_text(encoding="utf-8").strip()
    if not text:
        raise ValueError(f"版本文件为空: {version_file}")
    return text


def build_default_body(version: str) -> str:
    return dedent(
        f"""
        # DataAI v{version} 发布说明

        这是 DataAI 的一个新版本发布，DataAI 是一款本地运行的 **数据库 AI 助手**，专注帮助开发者和数据同学在本机高效完成 SQL 查询与建模工作。

        ## 本版本亮点

        - ✅ 新增：查询历史与收藏功能
          - 自动记录每次执行的 SQL（包括 AI 生成的查询）；
          - 提供「查询历史」面板和 CLI `db-ai history` 命令，方便回看和复用；
          - 支持将常用 SQL 加入收藏，一键插回编辑器。
        - ✅ 新增：AI 记忆可视化页面
          - 在「设置 → AI 记忆」里，可以查看：
            - 命名规范样例（naming_conventions）；
            - 相似历史查询（query_patterns）；
            - 表级摘要（table_summaries）；
            - 最近纠错记录（corrections）。
          - 支持按连接 + 数据库维度，清空当前记忆或手动生成表级摘要。
        - ✅ AI 生成 SQL 与记忆深度集成
          - LangGraph 查询 / 建表 / 改表流程会自动召回长期记忆；
          - 在系统 Prompt 中加入「历史命名规范 / 相似查询 / 纠错模式」，让后续 SQL 更贴合当前业务库。

        ## 项目简介

        - 支持数据库：
          - MySQL / MariaDB / PostgreSQL / SQLite / Oracle / SQL Server / Redis。
        - 核心能力：
          - 自然语言查询 → SQL；
          - AI 建表 / 改表；
          - 查询结果可视化、分页、导出；
          - 查询历史与收藏；
          - AI 记忆系统与可视化。

        ## 获取方式

        - 仓库地址：`https://gitee.com/CodeYG/db-ai-pro`
        - 可从 Release 附件或 README 中的说明获取最新的 `DataAI.exe`。

        如在使用中有任何建议或问题，欢迎在 Issues 中反馈，感谢支持！
        """
    ).strip()  # noqa: E501


def create_release(
    token: str,
    owner: str,
    repo: str,
    tag_name: str,
    title: str,
    body: str,
) -> str:
    """
    调用 Gitee OpenAPI 创建 Release。

    Gitee Release API 文档：
    POST /repos/{owner}/{repo}/releases
    """
    url = f"{GITEE_API_BASE}/repos/{owner}/{repo}/releases"
    resp = requests.post(
        url,
        data={
            "access_token": token,
            "tag_name": tag_name,
            "name": title,
            "body": body,
        },
        timeout=20,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Gitee Release API 调用失败: {resp.status_code} {resp.text}")
    data = resp.json()
    return data.get("html_url") or data.get("url", "")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="为 CodeYG/db-ai-pro 创建带推荐文案的 Gitee Release")
    parser.add_argument(
        "--owner",
        default=DEFAULT_OWNER,
        help=f"Gitee 仓库 owner（默认: {DEFAULT_OWNER}）",
    )
    parser.add_argument(
        "--repo",
        default=DEFAULT_REPO,
        help=f"Gitee 仓库名（默认: {DEFAULT_REPO}）",
    )
    parser.add_argument(
        "--version-file",
        default="dist/VERSION.txt",
        help="版本号文件路径（默认: dist/VERSION.txt）",
    )
    parser.add_argument(
        "--tag",
        help="手动指定 tag 名（如 v1.2.3），不指定则使用 VERSION.txt 生成 v<version>",
    )
    parser.add_argument(
        "--title",
        help="Release 标题（默认: DataAI v<version> 发布）",
    )
    parser.add_argument(
        "--body-file",
        help="从指定 UTF-8 文本文件读取 Release 正文（可选），不指定则使用内置模版",
    )
    args = parser.parse_args(argv)

    # 兼容两种变量名：优先使用 GITEE_TOKEN，其次尝试 GITEE_ACCESS_TOKEN
    token = os.getenv("GITEE_TOKEN") or os.getenv("GITEE_ACCESS_TOKEN")
    if not token:
        print("错误：未找到环境变量 GITEE_TOKEN 或 GITEE_ACCESS_TOKEN，请先在系统或终端中设置。", file=sys.stderr)
        return 1

    project_root = Path(__file__).resolve().parents[1]
    version_path = (project_root / args.version_file).resolve()

    try:
        version = read_version(version_path)
    except Exception as e:
        print(f"读取版本号失败：{e}", file=sys.stderr)
        return 1

    tag_name = args.tag or f"v{version}"
    title = args.title or f"DataAI v{version} 发布"

    if args.body_file:
        try:
            body = (project_root / args.body_file).read_text(encoding="utf-8").strip()
        except Exception as e:
            print(f"读取正文文件失败：{e}", file=sys.stderr)
            return 1
    else:
        body = build_default_body(version)

    try:
        url = create_release(
            token=token,
            owner=args.owner,
            repo=args.repo,
            tag_name=tag_name,
            title=title,
            body=body,
        )
    except Exception as e:
        print(f"创建 Gitee Release 失败：{e}", file=sys.stderr)
        return 1

    print("已成功创建 Gitee Release：")
    print(url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

