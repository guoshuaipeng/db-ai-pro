import json
import pathlib

b64 = pathlib.Path(__file__).with_name("_zhihu_body.b64").read_text(encoding="ascii")
fn = f"""(el) => {{
  const b64 = {json.dumps(b64)};
  const u8 = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const text = new TextDecoder("utf-8").decode(u8);
  el.focus();
  if (el.tagName === "TEXTAREA" || (el.value !== undefined && el.type !== undefined)) {{
    el.value = text;
  }} else {{
    el.textContent = text;
  }}
  el.dispatchEvent(new InputEvent("input", {{ bubbles: true, inputType: "insertFromPaste" }}));
  el.dispatchEvent(new Event("change", {{ bubbles: true }}));
  return text.length;
}}"""
pathlib.Path(__file__).with_name("_eval_zhihu_fn.txt").write_text(fn, encoding="utf-8")
print(len(fn))
