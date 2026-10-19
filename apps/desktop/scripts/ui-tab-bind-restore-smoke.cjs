const puppeteer = require('puppeteer-core')
const fs = require('fs')
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
;(async()=>{
  const browser = await puppeteer.connect({browserURL:'http://127.0.0.1:9222', defaultViewport:null})
  const pages = await browser.pages()
  const page = pages.find(p=>p.url()&&!p.url().startsWith('devtools://'))||pages[0]
  for(let i=0;i<80;i++){
    const ready = await page.evaluate(()=>!!document.querySelector('.sidebar')&&!document.querySelector('.boot'))
    if(ready) break
    await sleep(200)
  }
  await sleep(800)

  // Click 客户总览 tab if present
  await page.evaluate(()=>{
    const tabs=[...document.querySelectorAll('.tab, [role="tab"], .editor-tab, .tabstrip button, .tabs button')]
    const hit=tabs.find(el=>(el.textContent||'').includes('客户总览'))
    if(hit) hit.click()
  })
  await sleep(400)

  const report = await page.evaluate(async ()=>{
    const version = document.querySelector('.title-version')?.textContent || ''
    const select = document.querySelector('select.tab-conn-select-input, .tab-conn-select select')
    const selectedText = select ? (select.options[select.selectedIndex]?.text || select.value) : ''
    const selectedValue = select ? select.value : ''
    const status = document.querySelector('.tab-conn-status')?.textContent || ''
    // Prefer reading from workspace bridge if exposed; else DOM
    return {
      version,
      selectedText,
      selectedValue,
      status,
      hasSampleOption: select ? [...select.options].some(o=>/示例业务库|sample-retail|retail/i.test(o.text+o.value)) : false,
    }
  })

  // Disk: workspace healed?
  const wsPath = process.env.APPDATA + '\\DataAI\\workspace.json'
  let disk = null
  if (fs.existsSync(wsPath)) {
    const ws = JSON.parse(fs.readFileSync(wsPath,'utf8'))
    const t = (ws.editorTabs||[]).find(x=>(x.title||'').includes('客户总览'))
    disk = t ? { connectionId: t.connectionId, databaseName: t.databaseName||null, title: t.title } : null
  }
  const connPath = process.env.APPDATA + '\\DataAI\\connections.json'
  const conns = JSON.parse(fs.readFileSync(connPath,'utf8'))
  const list = conns.connections || conns
  const hasSample = list.some(c=>c.id==='sample-retail')

  // Run ONLY if bound to sample — click 运行
  let runResult = null
  const boundToSample = report.selectedValue === 'sample-retail' || /示例业务库/.test(report.selectedText+report.status)
  if (boundToSample) {
    await page.evaluate(()=>{
      const btns=[...document.querySelectorAll('button')]
      const run=btns.find(b=>/^\s*运行\s*$/.test((b.textContent||'').trim()) || (b.getAttribute('aria-label')||'').includes('运行'))
      if(run) run.click()
    })
    await sleep(1500)
    runResult = await page.evaluate(()=>{
      const msg = document.querySelector('.message-log, .messages, [class*="message"]')?.innerText || ''
      const err = /snowy-cloud|doesn't exist|错误/.test(msg) && !/成功|行|返回/.test(msg)
      const ok = /成功|行|结果/.test(msg) && !/snowy-cloud/.test(msg)
      return { msg: msg.slice(0,300), looksError: /snowy-cloud|Table '.*' doesn't exist/.test(msg), okHint: ok }
    })
  }

  const pass = /3\.136\.16/.test(report.version)
    && hasSample
    && boundToSample
    && (!runResult || !runResult.looksError)

  console.log(JSON.stringify({ pass, report, disk, hasSample, boundToSample, runResult, policy: 'sample only — no prod hosts' }, null, 2))
  await browser.disconnect()
  if (!pass) process.exit(2)
})().catch(e=>{console.error(e); process.exit(1)})
