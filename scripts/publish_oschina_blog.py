"""
使用 OSChina OpenAPI 将推荐文章发布为博客。

access_token 获取与配置方式：

1. 在浏览器中完成 /action/oauth2/authorize 授权，拿到 code
2. 脚本会在缺少 OSCHINA_ACCESS_TOKEN 时，自动调用 /action/openapi/token 换取 access_token
3. 也可以手动将 access_token 配置为环境变量：

- OSCHINA_ACCESS_TOKEN         - OSChina OpenAPI access_token
- OSCHINA_CLIENT_ID           - OAuth2 客户端 ID（可选，用于自动换取 access_token）
- OSCHINA_CLIENT_SECRET       - OAuth2 客户端密钥（可选，用于自动换取 access_token）
- OSCHINA_AUTH_CODE           - /action/oauth2/authorize 返回的 code（可选）

用法示例（在 PowerShell 中）：

    cd e:\pythonProjects\db-ai
    $env:OSCHINA_ACCESS_TOKEN = "你的 access_token"
    python scripts/publish_oschina_blog.py

可选参数：
- --title      博客标题（默认使用推荐文案中的标题）
- --body-file  博客内容文件路径（UTF-8），默认 docs/推荐文章/DataAI推荐.md
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import requests


OSCHINA_API_BASE = "https://www.oschina.net"
DEFAULT_BODY_FILE = Path("docs/推荐文章/DataAI推荐.md")


def fetch_access_token_via_code(
    client_id: str,
    client_secret: str,
    redirect_uri: str,
    code: str,
) -> dict:
    """通过 /action/openapi/token 使用 authorization_code 换取 access_token。"""
    url = f"{OSCHINA_API_BASE}/action/openapi/token"
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
        "code": code,
        "dataType": "json",
    }
    resp = requests.post(url, data=data, timeout=15)
    resp.raise_for_status()
    return resp.json()


def extract_title_from_markdown(text: str) -> str:
    """从 Markdown 正文中提取第一行一级标题作为标题。"""
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("# "):
            return line.lstrip("#").strip()
    # 兜底：返回一个通用标题
    return "DB-AI：面向开发者的智能数据库助手"


def publish_blog(
    access_token: str,
    title: str,
    content: str,
    save_as_draft: int = 0,
    catalog: str | None = None,
    abstracts: str | None = None,
    tags: str | None = None,
    classification: int = 0,
    type_: int = 1,
    origin_url: str | None = None,
    privacy: int = 0,
    deny_comment: int = 0,
    auto_content: int = 0,
    as_top: int = 0,
) -> dict:
    """调用 OSChina /action/openapi/blog_pub 发布博客。"""
    url = f"{OSCHINA_API_BASE}/action/openapi/blog_pub"
    data = {
        "access_token": access_token,
        "title": title,
        "content": content,
        "save_as_draft": int(save_as_draft),
        "classification": int(classification),
        "type": int(type_),
        "privacy": int(privacy),
        "deny_comment": int(deny_comment),
        "auto_content": int(auto_content),
        "as_top": int(as_top),
    }

    if catalog:
        data["catalog"] = catalog
    if abstracts:
        data["abstracts"] = abstracts
    if tags:
        data["tags"] = tags
    if origin_url:
        data["origin_url"] = origin_url

    resp = requests.post(url, data=data, timeout=15)
    resp.raise_for_status()
    return resp.json()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="使用 OSChina OpenAPI 发布 DB-AI 推荐文章为博客"
    )
    parser.add_argument(
        "--title",
        help="博客标题（默认从 Markdown 一级标题中自动提取）",
    )
    parser.add_argument(
        "--body-file",
        default=str(DEFAULT_BODY_FILE),
        help=f"博客内容文件路径（UTF-8，默认: {DEFAULT_BODY_FILE}）",
    )
    parser.add_argument(
        "--save-as-draft",
        action="store_true",
        help="将博客保存为草稿而不是直接发布",
    )
    parser.add_argument(
        "--tags",
        default="数据库,AI,DB-AI",
        help="博客标签（逗号分隔，默认：数据库,AI,DB-AI）",
    )
    parser.add_argument(
        "--redirect-uri",
        default="https://gitee.com/CodeYG/db-ai-pro",
        help="OAuth2 回调地址（需与在 OSChina 应用中配置的一致，默认：https://gitee.com/CodeYG/db-ai-pro）",
    )
    args = parser.parse_args(argv)

    access_token = os.getenv("OSCHINA_ACCESS_TOKEN")

    # 如果没有直接配置 access_token，尝试通过 code 自动获取
    if not access_token:
        client_id = os.getenv("OSCHINA_CLIENT_ID")
        client_secret = os.getenv("OSCHINA_CLIENT_SECRET")
        auth_code = os.getenv("OSCHINA_AUTH_CODE")

        if client_id and client_secret and auth_code:
            try:
                token_resp = fetch_access_token_via_code(
                    client_id=client_id,
                    client_secret=client_secret,
                    redirect_uri=args.redirect_uri,
                    code=auth_code,
                )
            except requests.HTTPError as exc:
                text = exc.response.text if exc.response is not None else ""
                print(
                    f"通过 code 获取 access_token 失败（HTTP 错误）：{exc}，响应：{text}",
                    file=sys.stderr,
                )
                return 1
            except Exception as exc:  # noqa: BLE001
                print(f"通过 code 获取 access_token 失败：{exc}", file=sys.stderr)
                return 1

            access_token = token_resp.get("access_token")
            if not access_token:
                print(
                    f"通过 code 获取 access_token 失败，返回结果中没有 access_token 字段：{token_resp}",
                    file=sys.stderr,
                )
                return 1

            print("已通过 OSChina OAuth code 成功获取 access_token。")
            print("access_token 将用于本次发布，同时建议你将其配置到环境变量 OSCHINA_ACCESS_TOKEN 中以便后续使用。")
        else:
            print(
                "错误：未找到环境变量 OSCHINA_ACCESS_TOKEN，且缺少 OSCHINA_CLIENT_ID/OSCHINA_CLIENT_SECRET/OSCHINA_AUTH_CODE，"
                "无法通过 /action/openapi/token 自动获取 access_token。",
                file=sys.stderr,
            )
            return 1

    body_path = Path(args.body_file)
    if not body_path.is_file():
        print(f"错误：正文文件不存在：{body_path}", file=sys.stderr)
        return 1

    try:
        content = body_path.read_text(encoding="utf-8").strip()
    except Exception as exc:  # noqa: BLE001
        print(f"读取正文文件失败：{exc}", file=sys.stderr)
        return 1

    title = args.title or extract_title_from_markdown(content)

    try:
        result = publish_blog(
            access_token=access_token,
            title=title,
            content=content,
            save_as_draft=1 if args.save_as_draft else 0,
            tags=args.tags,
            classification=0,
            type_=1,
        )
    except requests.HTTPError as exc:
        text = exc.response.text if exc.response is not None else ""
        print(f"发布博客失败（HTTP 错误）：{exc}，响应：{text}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001
        print(f"发布博客失败：{exc}", file=sys.stderr)
        return 1

    error = result.get("error")
    desc = result.get("error_description") or result.get("message") or ""
    if str(error) != "200":
        print(f"发布博客失败：error={error}, 描述={desc}", file=sys.stderr)
        return 1

    print("已成功通过 OSChina OpenAPI 发布博客。")
    print(f"返回结果：{result}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

