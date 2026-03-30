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
  const ifr = document.querySelector("main iframe");
  if (!ifr) return "no-main-iframe";
  const doc = ifr.contentDocument;
  if (!doc) return "no-content-doc";
  const cm = doc.querySelector(".CodeMirror");
  if (cm && cm.CodeMirror) {{
    cm.CodeMirror.setValue(t);
    cm.CodeMirror.save();
    return "cm-iframe";
  }}
  const ce = doc.querySelector('[contenteditable="true"]');
  if (ce) {{
    ce.focus();
    ce.innerText = t;
    ce.dispatchEvent(new InputEvent("input", {{ bubbles: true }}));
    return "ce";
  }}
  return "fail";
}}"""
(WORKSPACE / "_csdn_iframe_eval.txt").write_text(fn, encoding="utf-8")
print(len(fn))
