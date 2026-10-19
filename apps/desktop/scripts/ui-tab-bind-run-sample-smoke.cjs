const puppeteer = require('puppeteer-core')
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
;(async()=>{
  const b = await puppeteer.connect({browserURL:'http://127.0.0.1:9222', defaultViewport:null})
  const pages = await b.pages()
  const page = pages.find(p=>p.url()&&!p.url().startsWith('devtools://'))||pages[0]
  await page.evaluate(()=>{
    const nodes = [...document.querySelectorAll('.tab-label, .editor-tab, [role="tab"], button, span')]
    const hit = nodes.find(el => (el.textContent||'').trim() === '客户总览')
    if (hit) hit.click()
  })
  await sleep(400)
  const before = await page.evaluate(()=>{
    const sel = document.querySelector('select.tab-conn-select-input')
    return { conn: sel?.value || '', label: sel?.selectedOptions?.[0]?.text || '' }
  })
  await page.evaluate(()=>{
    const btns=[...document.querySelectorAll('button')]
    const run=btns.find(b=>/^\s*运行\s*$/.test((b.textContent||'').trim()))
    if (run) run.click()
  })
  await sleep(2500)
  const after = await page.evaluate(()=>{
    const msgText = [...document.querySelectorAll('.message-log, .messages, .result-status')].map(e=>e.innerText).join('\n')
    return {
      tableMissing: /Table '.*customers' doesn't exist/i.test(msgText) || /Table '.*customers' doesn't exist/i.test(document.body.innerText),
      snowyCustomers: /snowy-cloud\.customers/i.test(msgText),
      gridRows: document.querySelectorAll('tbody tr').length,
      msgText: msgText.slice(0, 240),
    }
  })
  const pass =
    before.conn === 'sample-retail' &&
    /示例业务库/.test(before.label) &&
    !after.tableMissing &&
    !after.snowyCustomers &&
    after.gridRows > 0
  console.log(JSON.stringify({pass, before, after, policy:'sample only'}, null, 2))
  await b.disconnect()
  if (!pass) process.exit(2)
})().catch(e=>{console.error(e); process.exit(1)})
