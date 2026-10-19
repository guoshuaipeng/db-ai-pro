const puppeteer = require('puppeteer-core')
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
;(async()=>{
  const browser = await puppeteer.connect({browserURL:'http://127.0.0.1:9222', defaultViewport:null})
  const pages = await browser.pages()
  let page = pages.find(p=>p.url()&&!p.url().startsWith('devtools://'))||pages[0]

  const samples = []
  let sawReady = false
  for (let i = 0; i < 80; i++) {
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
      }
    })
    samples.push(snap)
    if (snap.hasSidebar && !snap.hasBoot) sawReady = true
    if (sawReady && snap.hasTree && snap.treeRows > 0 && !snap.hasLoading) break
    await sleep(100)
  }

  const afterReady = samples.filter((s) => s.hasSidebar && !s.hasBoot)
  const mismatchFlash = afterReady.some((s) => s.hasMismatch)
  const loadingSeen = afterReady.some((s) => s.hasLoading)
  const final = afterReady[afterReady.length - 1] || samples[samples.length - 1]
  const pass =
    !mismatchFlash &&
    final &&
    final.hasTree &&
    final.treeRows > 0 &&
    /3\.136\.14/.test(final.version)

  console.log(JSON.stringify({
    pass,
    mismatchFlash,
    loadingSeen,
    sampleCount: samples.length,
    afterReadyCount: afterReady.length,
    firstAfterReady: afterReady[0],
    final,
    policy: 'observe cold UI only — no prod writes',
  }, null, 2))
  await browser.disconnect()
  if (!pass) process.exit(2)
})().catch((e)=>{console.error(e); process.exit(1)})
