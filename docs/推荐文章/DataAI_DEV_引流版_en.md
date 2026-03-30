# I Stopped Pasting DDL Into Random Chatbots — Here's the Local Windows DB Client I Use

> **TL;DR**: Connect to **MySQL, PostgreSQL, Oracle, SQL Server, SQLite, MariaDB**, describe what you want in **plain language**, get **runnable SQL**. **CREATE/ALTER** with multi-turn chat, **LangGraph** agent, **long-term memory** per connection + database — so it gets smarter on *your* schema without uploading it to a random website.

If you do backend or data work, you've done this: copy table definitions into a browser tab, hope the model guesses the right dialect, then paste SQL back into DBeaver/Navicat. It works, but it's fragile and feels wrong for anything sensitive.

**DataAI** (also called **DB-AI** in releases) is a **PyQt6 desktop app** that keeps **credentials and memory local** and still gives you **tool-using agents** (schema fetch, enum sampling, dialect-aware generation). Below is why it's worth a **download**, not just a skim.

---

## Three reasons to click through to the releases page

1. **NL → SQL that knows your catalog** — The agent picks tables, loads DDL, can sample values, outputs syntax for **your** engine.  
2. **Schema changes that match existing style** — Multi-turn **CREATE/ALTER** with reference to tables you already have (naming, types, keys).  
3. **Memory that isn't a one-off chat** — Naming patterns, similar queries, **compressed table-level summaries**; optional **AI memory** UI to inspect or regenerate.

Plus: real **SQL editor** (highlighting, completion), **multi-tab results**, sort/filter/export, **Navicat import** (Windows registry / `.ncx`). **OpenAI-compatible** APIs or **local LLMs** (e.g. Ollama).

---

## Who it's for

| Role | Use case |
|------|----------|
| Backend / full-stack | Daily queries, debugging, draft heavy JOINs |
| Analysts | Explore data without memorizing dialects |
| DBAs | Multi-DB ops, structure review |

---

## Get it (this post is the ad — the binary is the proof)

- **Repo**: https://gitee.com/CodeYG/db-ai-pro  
- **Releases / installers**: https://gitee.com/CodeYG/db-ai-pro/releases  

**Star** the repo if it saves you time; **open an Issue** if something breaks. Share with anyone still doing the DDL-paste dance.

---

*DataAI is an open-source project; links above are canonical.*
