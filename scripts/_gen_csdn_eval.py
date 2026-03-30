"""一次性生成 CSDN evaluate_script 函数字符串（供 MCP 粘贴）。"""
import json
import pathlib

WORKSPACE = pathlib.Path(__file__).resolve().parent.parent
body = (WORKSPACE / "docs" / "推荐文章" / "DataAI推荐.md").read_text(encoding="utf-8")
fn = """() => {
  const t = """ + json.dumps(body) + """;
  const el = document.querySelector(".CodeMirror");
  if (el && el.CodeMirror) {
    el.CodeMirror.setValue(t);
    el.CodeMirror.save();
    return "cm5";
  }
  const ta = document.querySelector("textarea");
  if (ta) {
    ta.focus();
    ta.value = t;
    ta.dispatchEvent(new InputEvent("input", { bubbles: true }));
    return "ta";
  }
  return "fail";
}"""
path = WORKSPACE / "_csdn_eval_body.txt"
path.write_text(fn, encoding="utf-8")
print(path, len(fn))
