const puppeteer = require('puppeteer-core')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: null,
  })
  const pages = await browser.pages()
  let page = pages.find((p) => !p.url().startsWith('devtools://')) || pages[0]
  for (const p of pages) {
    const u = p.url()
    if (u && !u.startsWith('devtools://') && !u.startsWith('chrome-extension://')) {
      page = p
      break
    }
  }
  await sleep(1200)
  for (let i = 0; i < 40; i++) {
    const ready = await page.evaluate(
      () => !document.querySelector('.boot') && !!document.querySelector('.sidebar, .app'),
    )
    if (ready) break
    await sleep(250)
  }

  const report = await page.evaluate(() => {
    const q = (s) => document.querySelector(s)
    const qa = (s) => [...document.querySelectorAll(s)]
    const sideHead = q('.side-head')
    const tools = q('.conn-chrome-tools')
    const createBar = q('.conn-create-bar')
    const groupBar = q('.conn-group-bar')
    const persist = q('.expand-persist-status')
    const newConns = qa('button.btn-new-conn, button[aria-label="新建连接"]').filter((b) => {
      // exclude empty-state primary which only shows when no connections
      return !!b.closest('.side-head, .conn-create-bar, .conn-chrome-tools, .sidebar > *')
    })
    const headerNew = qa('.side-head button.btn-new-conn, .side-head button[aria-label="新建连接"]')
    const emptyNew = qa('.empty button, .empty-state button').filter((b) =>
      /新建连接/.test(b.textContent || ''),
    )
    const textBtnsInHead = sideHead
      ? [...sideHead.querySelectorAll('button')].map((b) => (b.textContent || '').trim().replace(/\s+/g, ' '))
      : []
    const toolArias = tools
      ? [...tools.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || (b.textContent || '').trim())
      : []
    // Detect overlapping / clipped junk in side-head (the old garbled strip class of bug)
    let headOverlap = false
    let headOverflow = false
    if (sideHead) {
      const hr = sideHead.getBoundingClientRect()
      const kids = [...sideHead.querySelectorAll('button, h1')]
      for (let i = 0; i < kids.length; i++) {
        const a = kids[i].getBoundingClientRect()
        if (a.bottom > hr.bottom + 2 || a.top < hr.top - 2) headOverflow = true
        for (let j = i + 1; j < kids.length; j++) {
          const b = kids[j].getBoundingClientRect()
          const iw = Math.min(a.right, b.right) - Math.max(a.left, b.left)
          const ih = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
          if (iw > 4 && ih > 4) headOverlap = true
        }
      }
    }
    // Garbled strip heuristic: many tiny-btn text labels stacked outside tools
    const tinyTextInSidebar = qa('.sidebar .tiny-btn.btn-ghost')
      .filter((b) => b.getClientRects().length && /导入|导出|展开|折叠/.test(b.textContent || ''))
      .map((b) => (b.textContent || '').trim())

    return {
      version: q('.title-version')?.textContent || '',
      hasSideHead: !!sideHead,
      hasChromeTools: !!tools,
      hasCreateBar: !!createBar,
      hasGroupBarVisible: !!groupBar,
      hasPersistStatus: !!persist,
      headerNewCount: headerNew.length,
      headerNewTexts: headerNew.map((b) => (b.textContent || '').trim().replace(/\s+/g, ' ')),
      emptyNewCount: emptyNew.length,
      totalBtnNewConn: qa('button.btn-new-conn').length,
      textBtnsInHead,
      toolArias,
      headOverlap,
      headOverflow,
      sideHeadHeight: sideHead ? Math.round(sideHead.getBoundingClientRect().height) : 0,
      tinyTextGhostOps: tinyTextInSidebar,
      searchPlaceholder: q('.search input')?.getAttribute('placeholder') || '',
    }
  })

  // Open chrome more → 新建分组 reveal
  const moreFlow = await page.evaluate(async () => {
    const more = document.querySelector('.conn-chrome-more button[aria-label="更多"]')
    if (!more) return { ok: false, reason: 'no more btn' }
    more.click()
    await new Promise((r) => setTimeout(r, 200))
    const menu = document.querySelector('.conn-chrome-menu')
    const items = menu ? [...menu.querySelectorAll('button')].map((b) => (b.textContent || '').trim()) : []
    const groupItem = menu && [...menu.querySelectorAll('button')].find((b) => /新建分组/.test(b.textContent || ''))
    if (!groupItem) return { ok: false, reason: 'no 新建分组 in menu', items, menu: !!menu }
    groupItem.click()
    await new Promise((r) => setTimeout(r, 200))
    const bar = document.querySelector('.conn-group-bar')
    const input = bar && bar.querySelector('input')
    return {
      ok: !!bar && !!input,
      items,
      groupBarVisible: !!bar,
      inputPlaceholder: input?.getAttribute('placeholder') || '',
    }
  })

  // Cancel group create
  await page.evaluate(() => {
    const cancel = [...document.querySelectorAll('.conn-group-bar button')].find((b) =>
      /取消/.test(b.textContent || '') || b.getAttribute('aria-label') === '取消新建分组',
    )
    if (cancel) cancel.click()
  })
  await sleep(200)

  // 新建连接 open + cancel
  const newConn = await page.evaluate(async () => {
    const btn =
      document.querySelector('.side-head button.btn-new-conn') ||
      document.querySelector('.side-head button[aria-label="新建连接"]')
    if (!btn) return { ok: false, reason: 'no header 新建连接' }
    btn.click()
    await new Promise((r) => setTimeout(r, 500))
    const hasDialog = !!document.querySelector('[role="dialog"], .dialog, .modal, .palette')
    const titles = [...document.querySelectorAll('h2, h1, .dialog-title, [role="dialog"] h2')]
      .map((el) => el.textContent.trim())
      .slice(0, 8)
    return {
      ok: hasDialog || titles.some((t) => /连接|新建/.test(t)),
      hasDialog,
      titles,
    }
  })
  await page.keyboard.press('Escape')
  await sleep(300)

  // Search still works (type + clear) — do not open prod hosts
  const search = await page.evaluate(async () => {
    const input = document.querySelector('.search input')
    if (!input) return { ok: false, reason: 'no search' }
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    nativeInputValueSetter.call(input, '___no_match_xyz___')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 300))
    const after = (input.value || '')
    nativeInputValueSetter.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return { ok: after === '___no_match_xyz___', valueWas: after }
  })

  const pass =
    report.hasSideHead &&
    report.hasChromeTools &&
    !report.hasCreateBar &&
    !report.hasPersistStatus &&
    report.headerNewCount === 1 &&
    !report.headOverlap &&
    !report.headOverflow &&
    report.tinyTextGhostOps.length === 0 &&
    /搜索主机/.test(report.searchPlaceholder) &&
    moreFlow.ok &&
    newConn.ok &&
    search.ok

  const out = {
    pass,
    report,
    moreFlow,
    newConn,
    search,
    policy: 'sample/UI only — no prod query',
  }
  console.log(JSON.stringify(out, null, 2))
  await browser.disconnect()
  if (!pass) process.exit(2)
}

main().catch((err) => {
  console.error('CONN_CHROME_VERIFY_FAIL', err)
  process.exit(1)
})
