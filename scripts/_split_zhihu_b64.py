import re
import pathlib

t = pathlib.Path(r"e:/pythonProjects/db-ai/_eval_zhihu_fn.txt").read_text(encoding="utf-8")
m = re.search(r'const b64 = "([^"]+)"', t)
if not m:
    raise SystemExit("no b64")
b64 = m.group(1)
chunks = [b64[i : i + 1800] for i in range(0, len(b64), 1800)]
root = pathlib.Path(r"e:/pythonProjects/db-ai")
for i, c in enumerate(chunks):
    (root / f"_zhihu_b64_chunk_{i}.txt").write_text(c, encoding="ascii")
print("b64 len", len(b64), "chunks", len(chunks))
