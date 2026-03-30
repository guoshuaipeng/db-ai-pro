import json
import pathlib

root = pathlib.Path(r"e:/pythonProjects/db-ai")
chunks = []
for i in range(3):
    chunks.append((root / f"_zhihu_b64_chunk_{i}.txt").read_text(encoding="ascii"))

init = "() => { window.__zhihuB64 = ''; return 0; }"
final = r"""(el) => {
  const b64 = window.__zhihuB64;
  const u8 = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const text = new TextDecoder("utf-8").decode(u8);
  el.focus();
  if (el.tagName === "TEXTAREA" || (el.value !== undefined && el.type !== undefined)) {
    el.value = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return text.length;
  }
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand("insertText", false, text);
  return (el.innerText || el.textContent || "").length;
}"""

calls = [{"function": init, "args": []}]
for i, c in enumerate(chunks):
    # base64 alphabet is safe inside single-quoted JS string
    fn = f"() => {{ window.__zhihuB64 += '{c}'; return window.__zhihuB64.length; }}"
    calls.append({"function": fn, "args": []})
calls.append({"function": final, "args": ["67_31"]})

for i, d in enumerate(calls):
    (root / f"_zhihu_eval_step_{i}.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    print(i, len(json.dumps(d)))
