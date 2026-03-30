"""
掘金 Markdown 编辑页注入正文（ByteMD + CodeMirror 5）。

掘金编辑器的无障碍树里正文是一个难以被 Playwright fill 的节点；在已登录的
「写文章」页打开开发者工具 Console，粘贴本脚本输出的代码即可一次性写入正文
并触发 input/change，便于自动保存草稿。

用法：

    python scripts/juejin_fill_editor_markdown.py
    python scripts/juejin_fill_editor_markdown.py --file docs/推荐文章/DataAI_掘金引流版.md
    python scripts/juejin_fill_editor_markdown.py --no-strip-heading

默认会去掉 Markdown 首行「# 标题」（掘金标题单独填在标题框里）。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
WORKSPACE = SCRIPT_DIR.parent
DEFAULT_FILE = WORKSPACE / "docs" / "推荐文章" / "DataAI_掘金引流版.md"


def _load_body(path: Path, strip_first_heading: bool) -> str:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if strip_first_heading and lines:
        first = lines[0].lstrip()
        if first.startswith("#"):
            lines = lines[1:]
            while lines and not lines[0].strip():
                lines = lines[1:]
    return "\n".join(lines).strip("\n") + ("\n" if lines else "")


def _build_snippet(markdown_body: str) -> str:
    lit = json.dumps(markdown_body, ensure_ascii=False)
    return f"""(() => {{
  const text = {lit};
  const wrap = document.querySelector('.bytemd-editor .CodeMirror') || document.querySelector('.CodeMirror');
  if (!wrap || !wrap.CodeMirror) {{
    console.error('未找到 CodeMirror，请确认当前在掘金写文章页且编辑器已加载。');
    return {{ ok: false, reason: 'no CodeMirror' }};
  }}
  const cm = wrap.CodeMirror;
  cm.setValue(text);
  cm.refresh();
  const ta = typeof cm.getTextArea === 'function' ? cm.getTextArea() : null;
  if (ta) {{
    ta.dispatchEvent(new Event('input', {{ bubbles: true }}));
    ta.dispatchEvent(new Event('change', {{ bubbles: true }}));
  }}
  console.log('已写入', cm.getValue().length, '字符');
  return {{ ok: true, len: cm.getValue().length }};
}})();"""


def main() -> int:
    p = argparse.ArgumentParser(description="生成掘金编辑器 Console 注入脚本")
    p.add_argument(
        "--file",
        type=Path,
        default=DEFAULT_FILE,
        help=f"Markdown 文件路径（默认: {DEFAULT_FILE.relative_to(WORKSPACE)}）",
    )
    p.add_argument(
        "--no-strip-heading",
        action="store_true",
        help="保留文件第一行 # 标题（默认会去掉，避免与掘金标题重复）",
    )
    args = p.parse_args()
    path = args.file.resolve()
    if not path.is_file():
        print(f"错误：找不到文件 {path}", file=sys.stderr)
        return 1
    body = _load_body(path, strip_first_heading=not args.no_strip_heading)
    snippet = _build_snippet(body)
    print(
        "// 在 https://juejin.cn/editor/drafts/... 页面按 F12 → Console，粘贴下面整段并回车：\n"
    )
    print(snippet)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
