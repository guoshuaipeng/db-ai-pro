const puppeteer = require('puppeteer-core')

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

function parseColor(c) {
  if (!c) return null
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  if (!m) return { raw: c }
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4], raw: c }
}

function luminance({ r, g, b }) {
  const lin = [r, g, b].map((v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

function contrast(fg, bg) {
  if (!fg || !bg || fg.a == null || bg.raw == null) return null
  // If bg is near-transparent, treat as dark chrome (~#12141a)
  const solidBg = bg.a < 0.2
    ? { r: 18, g: 20, b: 26, a: 1 }
    : bg
  const L1 = luminance(fg)
  const L2 = luminance(solidBg)
  const lighter = Math.max(L1, L2)
  const darker = Math.min(L1, L2)
  return (lighter + 0.05) / (darker + 0.05)
}

async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null })
  const pages = await browser.pages()
  let page = pages[0]
  for (const p of pages) {
    const u = p.url()
    if (u && !u.startsWith('devtools://')) { page = p; break }
  }
  await sleep(1200)
  for (let i = 0; i < 40; i++) {
    const ready = await page.evaluate(() => !document.querySelector('.boot') && !!document.querySelector('.app, .editor-toolbar-row'))
    if (ready) break
    await sleep(250)
  }

  const base = await page.evaluate(() => {
    const btn =
      document.querySelector('button.btn-primary.run-btn') ||
      [...document.querySelectorAll('button.btn-primary')].find((b) => /运行|选区运行/.test(b.textContent || ''))
    if (!btn) return { found: false }
    const cs = getComputedStyle(btn)
    return {
      found: true,
      text: (btn.textContent || '').trim().replace(/\s+/g, ' '),
      version: document.querySelector('.title-version')?.textContent || '',
      background: cs.backgroundColor,
      color: cs.color,
      opacity: cs.opacity,
      filter: cs.filter,
      classes: btn.className,
    }
  })

  // Hover
  const handle = await page.evaluateHandle(() => {
    return (
      document.querySelector('button.btn-primary.run-btn') ||
      [...document.querySelectorAll('button.btn-primary')].find((b) => /运行|选区运行/.test(b.textContent || ''))
    )
  })
  const el = handle.asElement()
  if (!el) {
    console.log(JSON.stringify({ pass: false, reason: 'no run button', base }, null, 2))
    await browser.disconnect()
    process.exit(2)
  }
  await el.hover()
  await sleep(300)

  const hovered = await page.evaluate(() => {
    const btn =
      document.querySelector('button.btn-primary.run-btn') ||
      [...document.querySelectorAll('button.btn-primary')].find((b) => /运行|选区运行/.test(b.textContent || ''))
    const cs = getComputedStyle(btn)
    const icon = btn.querySelector('svg')
    const ics = icon ? getComputedStyle(icon) : null
    return {
      background: cs.backgroundColor,
      color: cs.color,
      opacity: cs.opacity,
      filter: cs.filter,
      visibility: cs.visibility,
      iconColor: ics ? ics.color : null,
      rect: (() => {
        const r = btn.getBoundingClientRect()
        return { w: Math.round(r.width), h: Math.round(r.height) }
      })(),
    }
  })

  const bg = parseColor(hovered.background)
  const fg = parseColor(hovered.color)
  const ratio = contrast(fg, bg)
  // Fail if background washed to near-transparent (old bug) OR contrast too low OR opacity 0
  const bgWashed = bg && bg.a != null && bg.a < 0.15
  const invisible =
    Number(hovered.opacity) < 0.5 ||
    hovered.visibility === 'hidden' ||
    bgWashed ||
    (ratio != null && ratio < 3) ||
    hovered.rect.w < 8 ||
    hovered.rect.h < 8

  const pass = base.found && !invisible

  const out = {
    pass,
    version: base.version,
    base,
    hovered,
    parsed: { bg, fg, contrast: ratio, bgWashed },
    policy: 'UI hover only — no SQL / no prod',
  }
  console.log(JSON.stringify(out, null, 2))
  await browser.disconnect()
  if (!pass) process.exit(2)
}

main().catch((e) => { console.error(e); process.exit(1) })
