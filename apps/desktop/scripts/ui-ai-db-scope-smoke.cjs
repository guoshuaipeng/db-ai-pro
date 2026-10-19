const puppeteer = require('puppeteer-core')
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
;(async()=>{
  const browser = await puppeteer.connect({browserURL:'http://127.0.0.1:9222', defaultViewport:null})
  const pages = await browser.pages()
  const page = pages.find(p=>p.url()&&!p.url().startsWith('devtools://'))||pages[0]
  for(let i=0;i<50;i++){
    if(await page.evaluate(()=>!!document.querySelector('.sidebar')&&!document.querySelector('.boot'))) break
    await sleep(200)
  }
  await sleep(600)

  const report = await page.evaluate(async ()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
    const version=document.querySelector('.title-version')?.textContent||''
    if(!document.querySelector('aside.ai')){
      [...document.querySelectorAll('button')].find(b=>/助手/.test(b.textContent||''))?.click()
      await sleep(350)
    }
    // Prefer opening snowy-cloud.client_user from tree if 测试数据库 present
    const connSel=document.querySelector('select.tab-conn-select-input')
    const opts=[...(connSel?.options||[])].map(o=>({value:o.value,text:o.text}))
    const testDb=opts.find(o=>/测试数据库/.test(o.text))
    let mode='unit-fallback'
    let hint='', body='', usedCustomers=false, usedClientUser=false, usedSnowy=false

    const clearAi=()=>[...document.querySelectorAll('aside.ai button')].find(b=>/清空/.test(b.textContent||''))?.click()

    if(testDb){
      mode='live-testdb'
      connSel.value=testDb.value
      connSel.dispatchEvent(new Event('change',{bubbles:true}))
      await sleep(400)
      // expand/find client_user row
      const rows=[...document.querySelectorAll('.sidebar .tree-row, .sidebar [data-tree-node-id]')]
      let userRow=rows.find(r=>/client_user/.test(r.textContent||'')||/client_user/.test(r.getAttribute('data-tree-node-id')||''))
      if(!userRow){
        // try click snowy-cloud database to expand
        const dbRow=rows.find(r=>/snowy-cloud/.test(r.textContent||'')&&!/client_user/.test(r.textContent||''))
        dbRow?.querySelector('button.twist, .twist')?.click()
        dbRow?.click()
        await sleep(800)
        userRow=[...document.querySelectorAll('.sidebar .tree-row')].find(r=>/client_user/.test(r.textContent||''))
      }
      if(userRow){
        userRow.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))
        await sleep(1200)
      }
      hint=document.querySelector('.ai-conn-hint')?.textContent||''
      clearAi(); await sleep(300)
      ;[...document.querySelectorAll('.intent-tabs button')].find(b=>/查询/.test(b.textContent||''))?.click()
      // type prompt via chip unavailable — use composer React set by typing
      const ta=document.querySelector('aside.ai textarea')
      if(ta){
        const setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value')?.set
        setter?.call(ta,'客户表有多少数据')
        ta.dispatchEvent(new Event('input',{bubbles:true}))
        await sleep(100)
        const send=[...document.querySelectorAll('aside.ai button.send-btn, aside.ai button[type="submit"]')].find(b=>!b.disabled)
        send?.click()
        await sleep(2500)
      }
      body=document.querySelector('aside.ai')?.innerText||''
      usedCustomers=/FROM\s+customers\b/i.test(body)
      usedClientUser=/client_user/i.test(body)
      usedSnowy=/snowy-cloud/i.test(body)
    } else {
      // sample path: still must not invent other DBs; customers OK on sample
      mode='sample'
      const sample=opts.find(o=>o.value==='sample-retail')
      if(sample){ connSel.value=sample.value; connSel.dispatchEvent(new Event('change',{bubbles:true})); await sleep(300)}
      hint=document.querySelector('.ai-conn-hint')?.textContent||''
      clearAi(); await sleep(250)
      const chip=[...document.querySelectorAll('aside.ai button.chip')].find(b=>/客户/.test(b.textContent||''))
      chip?.click(); await sleep(1500)
      body=document.querySelector('aside.ai')?.innerText||''
      usedCustomers=/FROM\s+customers\b/i.test(body)
      usedClientUser=/client_user/i.test(body)
    }

    return {version, mode, hint, usedCustomers, usedClientUser, usedSnowy, snippet: body.slice(0,500)}
  })

  const passLive = report.mode==='live-testdb' && /3\.136\.20/.test(report.version) && report.usedClientUser && report.usedSnowy && !report.usedCustomers && /snowy-cloud|测试数据库/.test(report.hint)
  const passSample = report.mode==='sample' && /3\.136\.20/.test(report.version) && report.usedCustomers && !report.usedClientUser
  const pass = passLive || passSample

  console.log(JSON.stringify({pass, passLive, passSample, report, policy:'SELECT-only describe; no writes'}, null, 2))
  await browser.disconnect()
  if(!pass) process.exit(2)
})().catch(e=>{console.error(e); process.exit(1)})
