import base64
import pathlib

WORKSPACE = pathlib.Path(__file__).resolve().parent.parent
raw = (WORKSPACE / "docs" / "推荐文章" / "DataAI推荐.md").read_bytes()
b64 = base64.b64encode(raw).decode("ascii")
fn = f"""() => {{
  const bin = atob("{b64}");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const t = new TextDecoder("utf-8").decode(bytes);
  const el = document.querySelector(".CodeMirror");
  if (el && el.CodeMirror) {{
    el.CodeMirror.setValue(t);
    el.CodeMirror.save();
    return "cm5";
  }}
  return "fail";
}}"""
(WORKSPACE / "_csdn_eval_b64.txt").write_text(fn, encoding="utf-8")
print(len(fn))
