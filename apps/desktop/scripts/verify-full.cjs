#!/usr/bin/env node
/**
 * DataAI desktop — full automated verification (sample / test DB only).
 *
 * NEVER points at production hosts (展业 / 172.19.161.x). Soft QA + UI smokes
 * use the bundled sample SQLite (retail.db) and open/cancel 新建连接 only.
 *
 * Usage (from apps/desktop):
 *   npm run verify:full
 *   node scripts/verify-full.cjs
 *   node scripts/verify-full.cjs --skip-build   # reuse existing out/
 *   node scripts/verify-full.cjs --ui-only      # assume Electron already on :9222
 *
 * Exit codes: 0 pass · 1 infra/error · 2 Soft QA or UI assertion failure
 */
const { spawn, execFileSync } = require('child_process')
const fs = require('fs')
const http = require('http')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const CDP_PORT = Number(process.env.DATAAI_CDP_PORT || 9222)
const SAMPLE_DB =
  process.env.DATAAI_SAMPLE_DB ||
  path.join(process.env.APPDATA || '', 'DataAI', 'sample', 'retail.db')

const args = new Set(process.argv.slice(2))
const skipBuild = args.has('--skip-build')
const uiOnly = args.has('--ui-only')
const skipUi = args.has('--skip-ui')

function log(msg) {
  console.log(`[verify-full] ${msg}`)
}

function run(cmd, cmdArgs, opts = {}) {
  log(`$ ${cmd} ${cmdArgs.join(' ')}`)
  execFileSync(cmd, cmdArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
    ...opts,
  })
}

function waitCdp(timeoutMs = 45000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      http
        .get(`http://127.0.0.1:${CDP_PORT}/json/version`, (res) => {
          res.resume()
          if (res.statusCode === 200) resolve(true)
          else retry()
        })
        .on('error', retry)
    }
    const retry = () => {
      if (Date.now() - start > timeoutMs) reject(new Error(`CDP not up on :${CDP_PORT}`))
      else setTimeout(tick, 400)
    }
    tick()
  })
}

function killDataAi() {
  try {
    if (process.platform === 'win32') {
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          "Get-Process electron -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue",
        ],
        { stdio: 'ignore' },
      )
    }
  } catch {
    /* ignore */
  }
}

async function softQa() {
  log('Soft QA: typecheck')
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'typecheck'])
  log('Soft QA: vitest')
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'])
}

async function build() {
  if (skipBuild) {
    log('skip build (--skip-build)')
    return
  }
  log('electron-vite build')
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'])
}

function launchElectron() {
  log(`launch Electron with --remote-debugging-port=${CDP_PORT}`)
  const electronBin =
    process.platform === 'win32'
      ? path.join(ROOT, 'node_modules', '.bin', 'electron.cmd')
      : path.join(ROOT, 'node_modules', '.bin', 'electron')
  const child = spawn(electronBin, ['.', `--remote-debugging-port=${CDP_PORT}`], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
    env: {
      ...process.env,
      ELECTRON_EXTRA_LAUNCH_ARGS: `--remote-debugging-port=${CDP_PORT}`,
    },
  })
  child.unref()
  return child
}

async function uiVerify() {
  const verifyScript = path.join(ROOT, 'scripts', 'ui-toolbar-smoke.cjs')
  if (!fs.existsSync(verifyScript)) {
    throw new Error(`missing ${verifyScript}`)
  }
  log(`UI smoke via ${verifyScript} (sample DB policy)`)
  if (SAMPLE_DB && fs.existsSync(SAMPLE_DB)) {
    log(`sample DB present: ${SAMPLE_DB}`)
  } else {
    log(`WARN sample DB not found at ${SAMPLE_DB || '(unset)'} — UI still runs; do not use prod`)
  }
  run(process.execPath, [verifyScript])
}

async function main() {
  log(`cwd=${ROOT}`)
  log('policy: sample/test DB only — never prod (展业 / 172.19.161.x)')
  log('full verify intended for 发布/release; small changes use targeted Soft QA + related UI')

  if (!uiOnly) {
    await softQa()
    await build()
  } else {
    log('ui-only: skip Soft QA + build')
  }

  if (skipUi) {
    log('skip UI (--skip-ui)')
    log('PASS soft QA (+ build if not skipped)')
    return
  }

  if (!uiOnly) {
    killDataAi()
    await new Promise((r) => setTimeout(r, 800))
    launchElectron()
    await waitCdp()
    // let renderer boot past splash
    await new Promise((r) => setTimeout(r, 2500))
  } else {
    await waitCdp(10000)
  }

  try {
    await uiVerify()
  } finally {
    if (!uiOnly && !args.has('--keep-open')) {
      log('stopping Electron')
      killDataAi()
    }
  }
  log('PASS Soft QA + UI smokes (sample DB policy)')
}

main().catch((err) => {
  console.error('[verify-full] FAIL', err)
  if (!args.has('--keep-open')) killDataAi()
  process.exit(err && err.status === 2 ? 2 : 1)
})
