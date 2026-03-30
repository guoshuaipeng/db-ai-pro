# 发布类脚本索引（DataAI 推广文）

所有脚本均在**仓库根目录**执行；正文默认在 `docs/推荐文章/`。更完整的协作流程见：

- `docs/推荐文章/多平台发布清单.md`
- `docs/推荐文章/多平台发布-操作流程.md`

---

## CSDN 两条路径与脚本怎么配

| 场景 | 推荐做法 | 用到的脚本 / 工具 |
|------|----------|---------------------|
| **Markdown 编辑页** `https://editor.csdn.net/md` | 本地 **剪贴板真粘贴**，触发 CodeMirror 完整管线 | `copy_recommend_md_to_clipboard.ps1` → 正文区 **Ctrl+A、Ctrl+V** |
| **接口直发**（少开浏览器） | Cookie 可用时一条命令 | `publish_csdn_post.py`（`CSDN_COOKIE`） |
| **创作中心富文本** `mp_blog/creation/editor` | MCP 可 `fill` iframe，但须再 **同步字数**（空格+退格或派发 `input`），见 `docs/推荐文章/多平台发布-操作流程.md` 第七节 | 一般**不**用剪贴板脚本；以页面内操作为主 |

---

## 速查表

| 脚本 | 作用 | 依赖 / 环境变量 | 示例命令 |
|------|------|-----------------|----------|
| `copy_recommend_md_to_clipboard.ps1` | 把指定 `.md` 全文写入剪贴板（UTF-8），供 **CSDN Markdown 编辑页**等 **Ctrl+V**（与 VS Code 复制再粘贴等价） | Windows PowerShell | `.\scripts\copy_recommend_md_to_clipboard.ps1`<br>`.\scripts\copy_recommend_md_to_clipboard.ps1 -FileName "DataAI_掘金引流版.md"` |
| `publish_csdn_post.py` | HTTP 提交 CSDN 博客（Markdown） | `CSDN_COOKIE`（必填）；可选 `pip install markdown requests_toolbelt` | `python scripts/publish_csdn_post.py --file docs/推荐文章/DataAI推荐.md`<br>`python scripts/publish_csdn_post.py --dry-run` |
| `publish_oschina_blog.py` | 开源中国 OpenAPI 发博客 | `OSCHINA_ACCESS_TOKEN` 或 OAuth：`OSCHINA_CLIENT_ID` + `OSCHINA_CLIENT_SECRET` + `OSCHINA_AUTH_CODE` | `python scripts/publish_oschina_blog.py --body-file docs/推荐文章/DataAI推荐.md` |
| `publish_gitee_post.py` | Gitee 仓库发 Issue / 讨论 | `GITEE_TOKEN` 或 `GITEE_ACCESS_TOKEN` | `python scripts/publish_gitee_post.py --body-file docs/推荐文章/DataAI推荐.md` |
| `juejin_fill_editor_markdown.py` | 输出一段 **浏览器 Console** 可执行 JS，向掘金编辑器 CodeMirror 写入正文 | 仅标准库；需在掘金**写文章页** F12 Console 粘贴运行 | `python scripts/juejin_fill_editor_markdown.py`<br>`python scripts/juejin_fill_editor_markdown.py --file docs/推荐文章/DataAI_掘金引流版.md` |
| `publish_recommend_all.ps1` | 按环境变量依次尝试 Gitee / CSDN / 开源中国 | 同上各变量 | `.\scripts\publish_recommend_all.ps1`<br>`.\scripts\publish_recommend_all.ps1 -DryRun` |

其他：`publish_gitee_release_post.py`、`publish_release.py` 与发版/Release 相关，非日常推广文必选。

---

## 约定

1. **不要在仓库中提交** Cookie、Token、密钥；用本机环境变量或私密 `.env`（若项目已支持）。
2. 发前可用各脚本自带的 `--dry-run`（若支持）或先读脚本 `--help`。
3. CSDN：**MD 编辑页**优先 `copy_recommend_md_to_clipboard.ps1` + **Ctrl+V**；**创作中心富文本**若用 MCP `fill`，须再同步字数后再发布（见 `docs/推荐文章/多平台发布-操作流程.md` 第七节与清单「创作中心富文本 iframe」条）。
