"""
使用 Gitee OpenAPI 为 db-ai-pro 仓库发布一篇推荐文章（Issue）。

流程与脚本索引：docs/推荐文章/多平台发布-操作流程.md · scripts/README-发布脚本.md

依赖：
- 环境变量 GITEE_TOKEN：Gitee 个人访问令牌，需具备 projects / issues 权限。

用法（在 PowerShell 中）：

    cd e:\\pythonProjects\\db-ai
    python scripts/publish_gitee_post.py

可选参数：
- --title 自定义标题
- --body-file 从文件读取正文（UTF-8），否则使用内置模版
"""

import argparse
import os
import sys
from textwrap import dedent

import requests


GITEE_API_BASE = "https://gitee.com/api/v5"
DEFAULT_OWNER = "CodeYG"
DEFAULT_REPO = "db-ai-pro"


def build_default_body() -> str:
    """构造一篇默认的 DataAI 推荐文案。"""
    return dedent(
        """
        # DataAI：本地运行的数据库 AI 助手

        `DataAI` 是一款专为开发者和数据同学设计的 **本地数据库 AI 助手**，支持多种主流数据库，在一台 Windows 机器上就可以完成「连接库 → 自然语言提问 → 生成 SQL → 查看/导出结果」的完整闭环。

        ## 支持的数据库类型

        - MySQL / MariaDB
        - PostgreSQL
        - SQLite
        - Oracle
        - SQL Server
        - Redis（命令生成与数据查看）

        ## 主要能力

        - **AI 查询**：用中文/自然语言描述需求，自动选表、拉结构、生成 SQL，并在结果表格中展示。
        - **AI 建表 / 改表**：通过多轮对话生成 `CREATE TABLE` / `ALTER TABLE` 语句，支持参考现有表结构和命名规范。
        - **查询历史与收藏**：
          - 自动记录每次查询（含 AI 生成的 SQL）；
          - 提供历史面板和收藏功能，一键复用常用 SQL；
          - CLI 侧支持 `db-ai history` 查看最近查询。
        - **AI 记忆系统**：
          - 记住库级命名规范、相似历史查询、纠错记录；
          - 按连接 + 数据库隔离存储，提升后续 AI 生成 SQL 的贴合度；
          - 提供「AI 记忆」可视化页面，可以查看 / 清空 / 生成表级摘要。

        ## 本地运行与打包

        本项目提供了一整套本地开发与打包脚本：

        - `scripts/run_build.py`：一键打包 `DataAI.exe`；
        - `scripts/publish_release.py`：发布到 GitHub / Gitee Release；
        - VSCode 启动配置：支持一键运行、打包与发布。

        详细的开发与发布说明可以参考仓库中的文档：

        - `docs/需求文档.md`
        - `docs/技术文档.md`
        - `docs/优化路线图.md`

        ## 获取与反馈

        - 仓库地址：`https://gitee.com/CodeYG/db-ai-pro`
        - 如果你在使用中遇到问题，欢迎直接在 Issues 区提交反馈；
        - 也欢迎 Star 支持一下这个项目，让更多人看到它 😊
        """
    ).strip()  # noqa: E501


def create_issue(
    token: str,
    owner: str,
    repo: str,
    title: str,
    body: str,
    labels: str = "推荐,DataAI",
) -> str:
    """调用 Gitee OpenAPI 创建 Issue，并返回 URL。"""
    url = f"{GITEE_API_BASE}/repos/{owner}/{repo}/issues"
    resp = requests.post(
        url,
        data={
            "access_token": token,
            "title": title,
            "body": body,
            "labels": labels,
        },
        timeout=15,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Gitee API 调用失败: {resp.status_code} {resp.text}")
    data = resp.json()
    return data.get("html_url") or data.get("url", "")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="为 CodeYG/db-ai-pro 发布 Gitee 推荐文章（Issue）")
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
        "--title",
        default="DataAI：本地数据库 AI 助手推荐",
        help="Issue 标题（默认为一条推荐标题）",
    )
    parser.add_argument(
        "--body-file",
        help="从指定的 UTF-8 文本文件读取正文（可选），不指定则使用内置模版",
    )
    args = parser.parse_args(argv)

    # 兼容两种变量名：优先使用 GITEE_TOKEN，其次尝试 GITEE_ACCESS_TOKEN
    token = os.getenv("GITEE_TOKEN") or os.getenv("GITEE_ACCESS_TOKEN")
    if not token:
        print("错误：未找到环境变量 GITEE_TOKEN 或 GITEE_ACCESS_TOKEN，请先在系统或终端中设置。", file=sys.stderr)
        return 1

    if args.body_file:
        try:
            with open(args.body_file, "r", encoding="utf-8") as f:
                body = f.read().strip()
        except Exception as e:
            print(f"读取正文文件失败：{e}", file=sys.stderr)
            return 1
    else:
        body = build_default_body()

    try:
        url = create_issue(
            token=token,
            owner=args.owner,
            repo=args.repo,
            title=args.title,
            body=body,
        )
    except Exception as e:
        print(f"创建 Gitee Issue 失败：{e}", file=sys.stderr)
        return 1

    print("已成功创建 Gitee 推荐文章 Issue：")
    print(url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

