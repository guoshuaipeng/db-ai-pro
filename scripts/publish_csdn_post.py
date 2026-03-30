"""
将本地 Markdown 推荐文章发布到 CSDN 博客。

流程与脚本索引：docs/推荐文章/多平台发布-操作流程.md · scripts/README-发布脚本.md

依赖：
- 环境变量 CSDN_COOKIE：浏览器登录 CSDN 后复制的 Cookie（整串）。
- 可选：pip install markdown requests_toolbelt（Markdown 转 HTML、multipart 提交）

用法：

    cd e:\\pythonProjects\\db-ai
    set CSDN_COOKIE=你的Cookie
    python scripts/publish_csdn_post.py

可选参数：
- --file  指定推荐文章 Markdown 文件（默认 docs/推荐文章/DataAI推荐.md）
- --title 文章标题（默认取文件首行 # 标题）
- --tags  标签，逗号分隔（默认：DataAI,数据库,Python,AI）
- --categories 分类（默认：Python）
- --dry-run 只打印将要提交的标题与内容长度，不实际发布
"""

import argparse
import os
import re
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("错误：请先安装 requests，例如 pip install requests", file=sys.stderr)
    sys.exit(1)

try:
    import markdown
except ImportError:
    markdown = None

try:
    from requests_toolbelt import MultipartEncoder
except ImportError:
    MultipartEncoder = None


# 项目根目录（脚本所在目录的上一级）
SCRIPT_DIR = Path(__file__).resolve().parent
WORKSPACE = SCRIPT_DIR.parent
DEFAULT_ARTICLE = WORKSPACE / "docs" / "推荐文章" / "DataAI推荐.md"

CSDN_SAVE_URL = "https://mp.csdn.net/mdeditor/saveArticle"


def md_to_html(text: str) -> str:
    """将 Markdown 转为 HTML。若无 markdown 库则做简单替换。"""
    if markdown is not None:
        return markdown.markdown(text, extensions=["extra", "codehilite"])
    # 极简回退：仅处理标题与段落
    html: list[str] = []
    for line in text.split("\n"):
        line = line.rstrip()
        if not line:
            html.append("<p></p>")
            continue
        m = re.match(r"^(#+)\s+(.*)$", line)
        if m:
            level = len(m.group(1))
            content = m.group(2)
            html.append(f"<h{level}>{content}</h{level}>")
        else:
            # 简单转义
            line = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            html.append(f"<p>{line}</p>")
    return "\n".join(html)


def get_title_from_md(content: str) -> str:
    """从 Markdown 内容中取第一行 # 标题。"""
    for line in content.split("\n"):
        line = line.strip()
        m = re.match(r"^#+\s+(.+)$", line)
        if m:
            return m.group(1).strip()
    return "DataAI：面向开发者的智能数据库助手"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="将推荐文章 Markdown 发布到 CSDN 博客")
    parser.add_argument(
        "--file",
        type=Path,
        default=DEFAULT_ARTICLE,
        help=f"推荐文案 Markdown 文件路径（默认: {DEFAULT_ARTICLE}）",
    )
    parser.add_argument(
        "--title",
        default=None,
        help="文章标题（默认取文件首行 # 标题）",
    )
    parser.add_argument(
        "--tags",
        default="DataAI,数据库,Python,AI",
        help="标签，逗号分隔",
    )
    parser.add_argument(
        "--categories",
        default="Python",
        help="分类",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="仅打印标题与内容长度，不实际发布",
    )
    args = parser.parse_args(argv)

    path = args.file if args.file.is_absolute() else WORKSPACE / args.file
    if not path.exists():
        print(f"错误：文件不存在 {path}", file=sys.stderr)
        return 1

    try:
        body = path.read_text(encoding="utf-8").strip()
    except Exception as e:
        print(f"读取文件失败：{e}", file=sys.stderr)
        return 1

    title = args.title or get_title_from_md(body)
    html_content = md_to_html(body)

    if args.dry_run:
        print("Dry-Run：不实际发布")
        print(f"标题: {title}")
        print(f"Markdown 长度: {len(body)}, HTML 长度: {len(html_content)}")
        return 0

    cookie = os.getenv("CSDN_COOKIE") or os.getenv("CSDN_COOKIES")
    if not cookie:
        print(
            "错误：未设置环境变量 CSDN_COOKIE。请登录 CSDN 后从浏览器复制 Cookie 并设置。",
            file=sys.stderr,
        )
        return 1

    if MultipartEncoder is None:
        print("错误：请安装 requests_toolbelt，例如 pip install requests_toolbelt", file=sys.stderr)
        return 1

    fields = {
        "title": title,
        "markdowncontent": body,
        "content": html_content,
        "id": "",
        "private": "",
        "tags": args.tags,
        "status": "0",  # 0 发布
        "categories": args.categories,
        "channel": "31",
        "type": "original",
        "articleedittype": "1",
        "Description": "",
        "csrf_token": "",
    }
    m = MultipartEncoder(fields, boundary="----WebKitFormBoundaryCSDNRecommend")
    headers = {
        "Cookie": cookie.strip(),
        "Content-Type": m.content_type,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }

    try:
        resp = requests.post(CSDN_SAVE_URL, headers=headers, data=m.to_string(), timeout=30)
    except Exception as e:
        print(f"请求失败：{e}", file=sys.stderr)
        return 1

    if resp.status_code >= 400:
        print(f"CSDN 接口返回错误: {resp.status_code}", file=sys.stderr)
        print(resp.text[:500], file=sys.stderr)
        return 1

    try:
        data = resp.json()
    except Exception:
        print("响应非 JSON，原始内容：", resp.text[:300])
        return 1

    # 常见返回：{"code":200,"message":"success",...} 或 {"success":true,...}
    if data.get("code") == 200 or data.get("success") is True:
        article_url = data.get("data", {}).get("url") or data.get("url") or ""
        print("已成功发布到 CSDN：")
        if article_url:
            print(article_url)
        else:
            print("请到 CSDN 博客后台查看。")
        return 0

    print(f"发布失败：{data}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
