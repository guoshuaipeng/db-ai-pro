const puppeteer = require('puppeteer-core')
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null })
  const pages = await browser.pages()
  let page = pages.find((p) => p.url() && !p.url().startsWith('devtools://')) || pages[0]
  await sleep(800)
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => !!document.querySelector('.sidebar') && !document.querySelector('.boot'))) break
    await sleep(200)
  }
  const version = await page.evaluate(() => document.querySelector('.title-version')?.textContent || '')

  // search table
  await page.evaluate(() => {
    const input = document.querySelector('.search input')
    if (!input) return
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, 'client_file_crawler')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await sleep(1000)

  const tableHit = await page.evaluate(() => {
    const hit = [...document.querySelectorAll('.tree-hit')].find((el) =>
      /client_file_crawler/.test(el.querySelector('.tree-label')?.textContent || ''),
    )
    if (!hit) return null
    hit.setAttribute('data-ui-probe', 'tbl')
    hit.closest('.tree-row')?.setAttribute('data-ui-probe-row', 'tbl')
    return (hit.querySelector('.tree-label')?.textContent || '').trim()
  })
  if (!tableHit) {
    console.log(JSON.stringify({ pass: false, reason: 'table not found', version }, null, 2))
    await browser.disconnect()
    process.exit(2)
  }

  // close structure if open
  await page.evaluate(() => document.querySelector('.structure-overlay .structure-shell') && document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  await page.keyboard.press('Escape')
  await sleep(200)

  // double-click
  const el = await page.$('[data-ui-probe="tbl"]')
  const box = await el.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 2 })
  await sleep(2000)
  const afterDbl = await page.evaluate(() => ({
    structureOpen: !!document.querySelector('.structure-overlay'),
    findErr: !!document.querySelector('.structure-overlay') && /找不到表/.test(document.querySelector('.structure-overlay')?.innerText || ''),
  }))

  // context menu
  await page.evaluate(() => {
    const row = document.querySelector('[data-ui-probe-row="tbl"]')
    row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
  })
  await sleep(300)
  const menuItems = await page.evaluate(() =>
    [...document.querySelectorAll('.menu button')].map((b) => (b.textContent || '').trim()),
  )
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.menu button')].find((b) => (b.textContent || '').trim() === '表结构')
    if (!btn) return false
    btn.click()
    return true
  })
  // wait for structure load
  let structureState = null
  for (let i = 0; i < 20; i++) {
    await sleep(300)
    structureState = await page.evaluate(() => {
      const overlay = document.querySelector('.structure-overlay')
      if (!overlay) return { open: false }
      const text = overlay.innerText || ''
      const loading = /正在|加载/.test(text) && !/列|索引|DDL/.test(text)
      return {
        open: true,
        title: document.querySelector('#structure-title')?.textContent?.trim() || '',
        kicker: document.querySelector('.structure-kicker')?.textContent?.trim() || '',
        findErr: /找不到表/.test(text),
        findErrText: (text.match(/找不到表[^\n]*/)?.[0] || ''),
        hasColumnsTab: /列/.test(text),
        hasColumnRows: (overlay.querySelectorAll('tbody tr, .structure-columns tr, table tr').length || 0) > 1,
        loading,
        snippet: text.slice(0, 500),
      }
    })
    if (structureState.open && !structureState.loading) break
  }

  await page.keyboard.press('Escape')

  const dblPass = !afterDbl.structureOpen
  const menuPass = clicked && menuItems.includes('表结构')
  const structPass = !!(structureState?.open && !structureState.findErr && (structureState.hasColumnRows || structureState.hasColumnsTab))
  const pass = dblPass && menuPass && structPass

  console.log(JSON.stringify({ pass, version, tableHit, afterDbl, menuItems, clicked, structureState, checks: { dblPass, menuPass, structPass } }, null, 2))
  await browser.disconnect()
  if (!pass) process.exit(2)
}
main().catch((e) => { console.error(e); process.exit(1) })
