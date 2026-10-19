const puppeteer = require('puppeteer-core')
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
;(async()=>{
  const browser = await puppeteer.connect({browserURL:'http://127.0.0.1:9222', defaultViewport:null})
  const pages = await browser.pages()
  let page = pages.find(p=>p.url()&&!p.url().startsWith('devtools://'))||pages[0]
  await sleep(2000)
  for(let i=0;i<60;i++){
    const ready=await page.evaluate(()=>!!document.querySelector('.sidebar')&&!document.querySelector('.boot')&&!document.querySelector('.tree-refresh-spin'))
    // also wait schema refresh flag gone
    if(ready) break
    await sleep(250)
  }
  await sleep(1500)
  const report = await page.evaluate(()=>{
    const selected=document.querySelector('.tree-row.is-selected')
    const id=selected?.getAttribute('data-tree-node-id')||null
    const label=selected?.querySelector('.tree-label')?.textContent?.trim()||null
    let inView=false
    if(selected){
      const r=selected.getBoundingClientRect()
      const side=document.querySelector('.sidebar')?.getBoundingClientRect()
      if(side) inView = r.top>=side.top-4 && r.bottom<=side.bottom+4
    }
    const openConn=[...document.querySelectorAll('.sidebar [data-tree-node-id]')].filter(el=>{
      const id=el.getAttribute('data-tree-node-id')||''
      if(id.includes(':')) return false
      const twist=el.querySelector('button.twist')
      return twist?.classList.contains('is-open')
    }).map(el=>(el.querySelector('.tree-label')?.textContent||'').trim())
    const falseKeysInDom=0 // N/A
    return {
      version: document.querySelector('.title-version')?.textContent||'',
      selectedId: id,
      selectedLabel: label,
      selectedInView: inView,
      openConnectionLabels: openConn,
      openTwistCount: document.querySelectorAll('.sidebar button.twist.is-open').length,
    }
  })
  const fs=require('fs')
  const ws=JSON.parse(fs.readFileSync(process.env.APPDATA+'\\\\DataAI\\\\workspace.json','utf8'))
  const e=ws.expanded||{}
  const pass = !!(
    report.version.includes('3.136.13') &&
    report.selectedId &&
    report.selectedInView &&
    Object.keys(e).every(k=>e[k]===true) &&
    Object.keys(e).length < 500
  )
  console.log(JSON.stringify({pass, report, disk:{expanded_count:Object.keys(e).length, selectedId:ws.selectedId, allTrue:Object.values(e).every(v=>v===true)}},null,2))
  await browser.disconnect()
  if(!pass) process.exit(2)
})().catch(e=>{console.error(e); process.exit(1)})
