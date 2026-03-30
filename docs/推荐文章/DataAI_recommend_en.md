# DataAI: A Local AI Database Client — From Plain Language to Executable SQL

**DataAI** (also referenced as **DB-AI** in repos and releases) is a **Windows desktop** database tool for developers, analysts, and DBAs. Connect locally to **MySQL, PostgreSQL, Oracle, SQL Server, SQLite, MariaDB**, and more; run queries and schema work using **natural language or SQL**; export results. It ships with an **AI agent (LangGraph)** and **long-term memory** so the more you use it on the same database, the better SQL generation matches your tables and habits.

---

## Get it

- **Gitee repository**: https://gitee.com/CodeYG/db-ai-pro  
- **Releases (installers & notes)**: https://gitee.com/CodeYG/db-ai-pro/releases  

Stars and Issues are welcome.

---

## Why try it?

### 1. Natural language → runnable SQL, grounded in your schema

- Describe what you need in plain language; the agent **picks tables, loads DDL, and can sample enum-like values** before emitting SQL.  
- **Dialect-aware** output for MySQL, PostgreSQL, Oracle, etc.  
- If the editor already contains SQL, short follow-ups (e.g. “only active rows”, “order by time desc”) **build on that context** instead of guessing table names from scratch.

### 2. AI-assisted CREATE / ALTER aligned with your existing style

- **Multi-turn** clarification for `CREATE TABLE` / `ALTER TABLE`.  
- Uses existing tables as reference for **naming, types, keys, and indexes**—handy when extending a brownfield system.

### 3. Long-term memory

- Per **connection + database**: naming patterns, similar past queries, **table-level summaries** (compressed usage patterns), and more.  
- Later prompts include **“how tables are typically used”** so you repeat business context less often.  
- **“AI memory”** UI to inspect, clear, or **regenerate table summaries** manually.

### 4. A real client, not only a chat box

- **SQL editor** with highlighting, formatting, and schema-based completion; multiple statements and result tabs.  
- **Result grids**: sort, filter, row edits with UPDATE generation, export to CSV / Excel / JSON (per current release).  
- **Connection manager** with encrypted storage; **Navicat import** (Windows registry / `.ncx`) to reduce migration friction.  
- Table sync, Redis-related features, etc.—see project README and release notes.

### 5. Local-first, flexible models

- Runs **locally**; credentials and memory stay on your machine (AI calls still depend on your chosen API or local LLM).  
- **OpenAI-compatible** endpoints—cloud APIs or **Ollama** and similar.

---

## Who it’s for

| Role | Typical use |
|------|-------------|
| Backend / full-stack | Daily querying, debugging, drafting complex JOINs/aggregates |
| Data analysts | Explore schemas without memorizing SQL dialects |
| DBAs / ops | Multi-DB management, structure review, scripting workflows |
| Tech leads | Balance productivity with data-boundary policies |

---

## Stack (short)

Python 3.8+, **PyQt6**, **SQLAlchemy**, **LangGraph** query agent, OpenAI-compatible APIs. See `docs/` in the repo for architecture notes.

---

## Closing

If you want **less boilerplate SQL** and **less mental load per table**, but prefer **not** to upload your schema to a random web-only tool, **DataAI** combines a proper client with LLM assistance on your own machine.

**Repo**: https://gitee.com/CodeYG/db-ai-pro  
**Download**: https://gitee.com/CodeYG/db-ai-pro/releases  

---

*When reposting, please keep the project links. Feedback from real workflows helps the project evolve.*
