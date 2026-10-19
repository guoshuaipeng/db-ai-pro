const puppeteer = require('puppeteer-core')
const { execFileSync } = require('child_process')
const path = require('path')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function win32Resize(state) {
  const ps1 = path.join(__dirname, 'scripts', '_win32_resize.ps1')
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-State', String(state)],
      { encoding: 'utf8', timeout: 10000 },
    )
    return /OK/.test(out)
  } catch {
    return false
  }
}

async function layoutReport(page, label) {
  return page.evaluate((label) => {
    const q = (s) => document.querySelector(s)
    const qa = (s) => [...document.querySelectorAll(s)]

    function rowOk(row) {
      if (!row) return { ok: false, reason: 'missing' }
      const r = row.getBoundingClientRect()
      const kids = [...row.children]
      let maxBottom = 0
      let minTop = Infinity
      for (const k of kids) {
        const kr = k.getBoundingClientRect()
        if (kr.width < 1 && kr.height < 1) continue
        maxBottom = Math.max(maxBottom, kr.bottom)
        minTop = Math.min(minTop, kr.top)
      }
      const span = maxBottom === 0 ? 0 : maxBottom - minTop
      const clipped = [...row.querySelectorAll('button, .tiny-btn, .run-btn')].some((btn) => {
        const b = btn.getBoundingClientRect()
        if (b.width < 2 || b.height < 2) return false
        if (btn.closest('.toolbar-overflow-menu')) return false
        if (btn.closest('.toolbar-overflow-measure')) return false
        return b.right > r.right + 2 || b.left < r.left - 2
      })
      const secondary = row.querySelector('.toolbar-overflow-secondary')
      const overflowClip =
        secondary != null && secondary.scrollWidth > secondary.clientWidth + 2
      const more = row.querySelector('button.toolbar-more-btn')
      const visibleAttr = row.querySelector('[data-toolbar-visible]')
      const visibleCount = visibleAttr
        ? Number(visibleAttr.getAttribute('data-toolbar-visible'))
        : null
      const measureKids = row.querySelector('.toolbar-overflow-measure')?.children.length ?? 0
      const needsMore =
        measureKids > 0 &&
        visibleCount != null &&
        visibleCount < measureKids &&
        !more
      return {
        ok: span <= 60 && !clipped && !overflowClip && !needsMore && r.height <= 80,
        height: Math.round(r.height),
        span: Math.round(span),
        clipped: clipped || overflowClip,
        needsMore,
        more: more ? (more.textContent || '').trim() : null,
        visibleCount,
        measureKids,
        width: Math.round(r.width),
      }
    }

    const btns = [
      ...document.querySelectorAll('.editor-toolbar-row button, .result-toolbar-row button'),
    ].filter(
      (b) =>
        b.getClientRects().length &&
        b.offsetWidth > 0 &&
        !b.closest('.toolbar-overflow-menu') &&
        !b.closest('.toolbar-overflow-measure'),
    )
    let overlaps = 0
    for (let i = 0; i < btns.length; i++) {
      const a = btns[i].getBoundingClientRect()
      for (let j = i + 1; j < btns.length; j++) {
        const b = btns[j].getBoundingClientRect()
        const iw = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const ih = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (iw > 4 && ih > 4) overlaps++
      }
    }

    const moreBtns = qa('button.toolbar-more-btn')
    const newConn = qa('button.btn-new-conn, button[aria-label="新建连接"]')
    const connLabels = qa('.tree-label, .tree-hit')
      .map((el) => el.textContent.trim())
      .slice(0, 30)

    return {
      label,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      editor: rowOk(q('.editor-toolbar-row')),
      result: rowOk(q('.result-toolbar-row')),
      moreCount: moreBtns.length,
      moreLabels: moreBtns.map((b) => b.textContent.trim()),
      newConnCount: newConn.length,
      newConnTexts: newConn.map((b) => b.textContent.trim().replace(/\s+/g, ' ')),
      overlaps,
      version: q('.title-version')?.textContent || '',
      ready: !q('.boot') && !!q('.app, .sidebar, .titlebar'),
      connLabels,
      sampleVisible: connLabels.some((t) => /示例|sample|retail/i.test(t)),
      prodHostsVisible: connLabels.some((t) => /172\.19\.|展业/.test(t)),
    }
  }, label)
}

async function setWindowState(page, state) {
  const ok = win32Resize(state)
  if (!ok) {
    const map = { maximized: [1600, 900], normal: [1100, 760], narrow: [900, 700], wide: [1400, 860] }
    const [w, h] = map[state] || map.normal
    await page.setViewport({ width: w, height: h }).catch(() => {})
  }
  await sleep(1000)
}

async function main() {
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: null,
  })
  const pages = await browser.pages()
  let page = pages[0]
  for (const p of pages) {
    const u = p.url()
    if (u && u !== 'about:blank') {
      page = p
      break
    }
  }
  await sleep(1500)
  for (let i = 0; i < 40; i++) {
    const ready = await page.evaluate(
      () => !document.querySelector('.boot') && !!document.querySelector('.app, .sidebar, .titlebar'),
    )
    if (ready) break
    await sleep(250)
  }

  const results = []

  await page.evaluate(() => {
    const hits = [...document.querySelectorAll('.tree-hit, .tree-label')]
    const sample = hits.find((el) => /示例|sample|retail/i.test(el.textContent || ''))
    if (sample) sample.click()
  })
  await sleep(500)

  for (const state of ['maximized', 'normal', 'narrow', 'wide', 'maximized', 'normal', 'maximized', 'normal']) {
    await setWindowState(page, state)
    results.push(await layoutReport(page, state))
  }

  let newConnClick = { ok: false }
  {
    const clicked = await page.evaluate(() => {
      const btn =
        document.querySelector('button.btn-new-conn') ||
        document.querySelector('button[aria-label="新建连接"]')
      if (!btn) return { found: false }
      btn.click()
      return { found: true, text: (btn.textContent || '').trim() }
    })
    await sleep(700)
    const dialog = await page.evaluate(() => {
      const titles = [...document.querySelectorAll('h2, h1, .dialog-title, [role="dialog"] h2')].map((el) =>
        el.textContent.trim(),
      )
      const hasDialog = !!document.querySelector('[role="dialog"], .dialog, .palette, .modal')
      return { hasDialog, titles: titles.slice(0, 10) }
    })
    newConnClick = {
      ok: !!(clicked.found && (dialog.hasDialog || dialog.titles.some((t) => /连接|新建/.test(t)))),
      clicked,
      dialog,
      note: 'opened dialog only — cancelled; no prod write',
    }
    await page.keyboard.press('Escape')
    await sleep(400)
  }

  let moreClick = { ok: false, detail: 'no more button at narrow' }
  {
    await setWindowState(page, 'narrow')
    const info = await page.evaluate(() => {
      const root = document.querySelector('.editor-toolbar-actions, .editor-toolbar')
      const measureKids = root?.querySelector('.toolbar-overflow-measure')?.children.length ?? 0
      const visible = root ? Number(root.getAttribute('data-toolbar-visible') || measureKids) : 0
      const btn = document.querySelector('button.toolbar-more-btn')
      if (!btn) return { found: false, measureKids, visible, shouldHaveMore: measureKids > visible }
      btn.click()
      return {
        found: true,
        label: (btn.textContent || '').trim(),
        measureKids,
        visible,
        shouldHaveMore: measureKids > visible,
      }
    })
    await sleep(500)
    if (info.found) {
      const menu = await page.evaluate(() => {
        const m = document.querySelector('.toolbar-overflow-menu.is-portal, .toolbar-overflow-menu')
        return { open: !!m, items: m ? m.querySelectorAll('button').length : 0 }
      })
      moreClick = { ok: !!menu.open, info, menu }
      await page.keyboard.press('Escape')
    } else if (info.shouldHaveMore) {
      moreClick = { ok: false, detail: 'narrow should show 更多 but button missing', info }
    } else {
      moreClick = { ok: true, detail: 'all actions fit at narrow — no 更多 needed', info }
    }
  }

  const layoutPass = results.every(
    (r) =>
      r.ready &&
      r.editor.ok &&
      r.overlaps === 0 &&
      r.newConnCount > 0 &&
      (r.result.ok || r.result.reason === 'missing'),
  )
  const narrowLike = results.filter((r) => r.label === 'narrow' || r.label === 'normal')
  const moreSeen = narrowLike.some((r) => r.moreCount > 0)

  const out = {
    dbPolicy:
      'UI-only against sample selection when present; 新建连接 dialog open/cancel only; no queries/writes to 172.19 / 展业',
    sampleDbFile: 'C:\\Users\\user\\AppData\\Roaming\\DataAI\\sample\\retail.db',
    layoutPass,
    newConnPass: newConnClick.ok,
    morePass: moreClick.ok,
    moreSeen,
    results,
    newConnClick,
    moreClick,
  }
  console.log(JSON.stringify(out, null, 2))
  await browser.disconnect()
  if (!out.layoutPass || !out.newConnPass || !out.morePass) process.exit(2)
}

main().catch((err) => {
  console.error('VERIFY_FAIL', err)
  process.exit(1)
})
