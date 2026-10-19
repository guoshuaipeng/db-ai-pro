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
  let page = pages.find((p) => p.url() && !p.url().startsWith('devtools://')) || pages[0]
  await sleep(800)
  for (let i = 0; i < 40; i++) {
    const ready = await page.evaluate(
      () => !document.querySelector('.boot') && !!document.querySelector('.sidebar, .app, .workspace'),
    )
    if (ready) break
    await sleep(250)
  }

  // Open settings: try menu/button or dispatch via evaluate if exposed
  await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('button, [role="menuitem"], a')]
    const btn = candidates.find((el) => /设置/.test((el.textContent || '') + (el.getAttribute('aria-label') || '') + (el.title || '')))
    if (btn) btn.click()
  })
  await sleep(600)

  // If not open, try keyboard / command palette common path
  let open = await page.evaluate(() => !!document.querySelector('.settings-shell, .settings-overlay'))
  if (!open) {
    await page.keyboard.down('Control')
    await page.keyboard.press(',')
    await page.keyboard.up('Control')
    await sleep(500)
    open = await page.evaluate(() => !!document.querySelector('.settings-shell, .settings-overlay'))
  }
  if (!open) {
    // last resort: click titlebar settings if any data attribute
    await page.evaluate(() => {
      const el = document.querySelector('[data-action="settings"], .btn-settings, button[aria-label*="设置"]')
      if (el) el.click()
    })
    await sleep(500)
  }

  const report = await page.evaluate(() => {
    const shell = document.querySelector('.settings-shell')
    const body = document.querySelector('.settings-body')
    const main = document.querySelector('.settings-main')
    if (!shell || !body || !main) {
      return { ok: false, reason: 'settings not open', open: !!shell }
    }
    const sr = shell.getBoundingClientRect()
    const br = body.getBoundingClientRect()
    const style = getComputedStyle(body)
    const canScroll = body.scrollHeight > body.clientHeight + 2
    // Force content tall check: bottom of last settings-card vs body clip
    const cards = [...body.querySelectorAll('.settings-card, .field, label')]
    const last = cards[cards.length - 1]
    const lastR = last ? last.getBoundingClientRect() : null
    // Scroll to bottom and ensure last control is visible inside body
    const beforeTop = body.scrollTop
    body.scrollTop = body.scrollHeight
    const afterTop = body.scrollTop
    const scrolled = afterTop > beforeTop || body.scrollHeight <= body.clientHeight + 2
    const lastAfter = last ? last.getBoundingClientRect() : null
    const lastVisible =
      !lastAfter ||
      (lastAfter.bottom <= br.bottom + 2 && lastAfter.top >= br.top - 2) ||
      (lastAfter.bottom <= sr.bottom + 2 && canScroll)
    // Clipping bug: body taller than shell without being able to scroll
    const bodyOverflowsShell = br.bottom > sr.bottom + 4
    const clippedWithoutScroll = bodyOverflowsShell && style.overflowY === 'visible'
    const flexOk = style.flexGrow === '1' || style.flex === '1 1 auto' || Number(style.flexGrow) > 0

    return {
      ok: !clippedWithoutScroll && (canScroll ? scrolled : true) && flexOk,
      version: document.querySelector('.title-version')?.textContent || '',
      shellH: Math.round(sr.height),
      bodyClientH: body.clientHeight,
      bodyScrollH: body.scrollHeight,
      canScroll,
      scrolled,
      flexOk,
      overflowY: style.overflowY,
      bodyOverflowsShell,
      clippedWithoutScroll,
      lastVisible,
      lastLabel: last ? (last.textContent || '').trim().slice(0, 40) : null,
      hasModelTitle: /模型与密钥/.test(document.querySelector('.settings-main-head h3')?.textContent || ''),
    }
  })

  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) {
    process.exitCode = 1
  }
  await browser.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
