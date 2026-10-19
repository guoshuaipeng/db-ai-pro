const puppeteer = require('puppeteer-core')
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
;(async()=>{
  const browser = await puppeteer.connect({browserURL:'http://127.0.0.1:9222', defaultViewport:null})
  const pages = await browser.pages()
  let page = pages.find(p=>p.url()&&!p.url().startsWith('devtools://'))||pages[0]

  const samples = []
  let sawReady = false
  for (let i = 0; i < 100; i++) {
    const snap = await page.evaluate(() => {
      const side = document.querySelector('.sidebar')
      const text = side?.innerText || ''
      return {
        version: document.querySelector('.title-version')?.textContent || '',
        hasBoot: !!document.querySelector('.boot'),
        hasSidebar: !!side,
        hasMismatch: /没有匹配的对象/.test(text),
        hasLoading: /正在加载对象树/.test(text),
        hasTree: !!document.querySelector('.sidebar .tree [role="treeitem"], .sidebar .tree-row'),
        treeRows: document.querySelectorAll('.sidebar .tree-row').length,
        spinning: !!document.querySelector('.sidebar .icon-btn.is-spinning'),
        rowRefreshing: !!document.querySelector('.sidebar .tree-row.is-refreshing'),
      }
    })
    samples.push(snap)
    if (snap.hasSidebar && !snap.hasBoot) sawReady = true
    // With cache: tree should appear immediately; wait until refresh settles
    if (sawReady && snap.hasTree && snap.treeRows > 0 && !snap.hasLoading && !snap.spinning) break
    await sleep(80)
  }

  const afterReady = samples.filter((s) => s.hasSidebar && !s.hasBoot)
  const mismatchFlash = afterReady.some((s) => s.hasMismatch)
  // Full-pane loading while tree already has rows is the bad flash
  const loadingWhileTree =
    afterReady.some((s) => s.hasLoading && s.treeRows > 0) ||
    afterReady.some((s) => s.hasLoading && s.hasTree)
  // First paint after ready should already have tree when schema-cache.json exists
  const first = afterReady[0]
  const final = afterReady[afterReady.length - 1] || samples[samples.length - 1]
  const fs = require('fs')
  const cachePath = process.env.APPDATA + '\\DataAI\\schema-cache.json'
  const hasCacheFile = fs.existsSync(cachePath)
  let cacheNodes = 0
  if (hasCacheFile) {
    try {
      const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
      cacheNodes = Array.isArray(raw.nodes) ? raw.nodes.length : 0
    } catch {}
  }

  // Pass criteria:
  // - version 3.136.15
  // - no false「没有匹配」
  // - never show full-pane loading alongside visible tree rows
  // - if cache exists, first after-ready sample should already have treeRows > 0 (instant paint)
  // - final has tree
  const instantPaintOk = !hasCacheFile || !first || (first.treeRows > 0 && !first.hasLoading)
  const pass =
    !mismatchFlash &&
    !loadingWhileTree &&
    instantPaintOk &&
    final &&
    final.hasTree &&
    final.treeRows > 0 &&
    /3\.136\.15/.test(final.version)

  console.log(JSON.stringify({
    pass,
    mismatchFlash,
    loadingWhileTree,
    instantPaintOk,
    hasCacheFile,
    cacheNodes,
    sampleCount: samples.length,
    afterReadyCount: afterReady.length,
    firstAfterReady: first,
    final,
    policy: 'observe cold UI only — no prod writes',
  }, null, 2))
  await browser.disconnect()
  if (!pass) process.exit(2)
})().catch((e)=>{console.error(e); process.exit(1)})
