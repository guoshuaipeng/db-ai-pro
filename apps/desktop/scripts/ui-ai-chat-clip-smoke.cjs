const puppeteer = require('puppeteer-core')
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

async function main(){
  const browser = await puppeteer.connect({browserURL:'http://127.0.0.1:9222', defaultViewport:null})
  const pages = await browser.pages()
  let page = pages.find(p=>p.url() && !p.url().startsWith('devtools://')) || pages[0]
  await sleep(1200)
  for(let i=0;i<40;i++){
    if(await page.evaluate(()=>!!document.querySelector('.app') && !document.querySelector('.boot'))) break
    await sleep(200)
  }

  // Ensure AI panel open
  await page.evaluate(()=>{
    const btn = [...document.querySelectorAll('button,[role="button"]')].find(b=>/助手|AI|自然语言/.test(b.textContent||b.getAttribute('aria-label')||''))
    // also try toggle via data / titlebar
    const ai = document.querySelector('.ai')
    if(!ai || ai.offsetWidth < 40){
      const toggles = [...document.querySelectorAll('button')]
      const t = toggles.find(b=>/助手|AI面板|自然语言/.test(b.getAttribute('title')||b.getAttribute('aria-label')||b.textContent||''))
      t?.click()
    }
  })
  await sleep(500)

  const seeded = await page.evaluate(()=>{
    // If history already has assistant cards, use them; else inject probe DOM is hard without state.
    const ai = document.querySelector('.ai')
    const cards = [...document.querySelectorAll('.ai-scroll > .card')]
    return {
      version: document.querySelector('.title-version')?.textContent || '',
      aiWidth: ai ? Math.round(ai.getBoundingClientRect().width) : 0,
      cardCount: cards.length,
      assistantCount: cards.filter(c=>c.classList.contains('card-assistant')).length,
      userCount: cards.filter(c=>c.classList.contains('card-user')).length,
    }
  })

  // If no turns, send a local-preview prompt to create messages
  if(seeded.cardCount < 2){
    await page.evaluate(()=>{
      const ta = document.querySelector('.composer textarea')
      if(!ta) return
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
      setter.call(ta, '华东的活跃客户')
      ta.dispatchEvent(new Event('input',{bubbles:true}))
    })
    await page.click('.composer button.send-btn, .composer button[type="submit"]')
    // wait for assistant reply
    for(let i=0;i<40;i++){
      await sleep(250)
      const n = await page.evaluate(()=>document.querySelectorAll('.ai-scroll > .card-assistant').length)
      const streaming = await page.evaluate(()=>!!document.querySelector('.card.is-streaming'))
      if(n>=1 && !streaming) break
    }
    // second turn to create overlap scenario
    await page.evaluate(()=>{
      const ta = document.querySelector('.composer textarea')
      if(!ta) return
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
      setter.call(ta, '修复失败 SQL：no such column: rowid')
      ta.dispatchEvent(new Event('input',{bubbles:true}))
    })
    await page.click('.composer button.send-btn, .composer button[type="submit"]')
    for(let i=0;i<40;i++){
      await sleep(250)
      const streaming = await page.evaluate(()=>!!document.querySelector('.card.is-streaming'))
      if(!streaming) break
    }
  }

  // Scroll AI list to top to inspect early cards
  await page.evaluate(()=>{ const s=document.querySelector('.ai-scroll'); if(s) s.scrollTop=0 })
  await sleep(200)

  const report = await page.evaluate(()=>{
    const scroll = document.querySelector('.ai-scroll')
    const cards = [...document.querySelectorAll('.ai-scroll > .card')]
    const items = cards.map((card, index)=>{
      const r = card.getBoundingClientRect()
      const clipped = card.scrollHeight > card.clientHeight + 2
      const cs = getComputedStyle(card)
      const flexShrink = cs.flexShrink
      // overlap with next card?
      let overlapsNext = false
      if(index < cards.length-1){
        const n = cards[index+1].getBoundingClientRect()
        overlapsNext = r.bottom > n.top + 2
      }
      const sql = card.querySelector('.sql-block pre')
      const sqlClipped = sql ? sql.scrollHeight > sql.clientHeight + 2 : false
      const sqlFullyInCard = sql ? (()=>{
        const sr = sql.getBoundingClientRect()
        return sr.bottom <= r.bottom + 1 && sr.top >= r.top - 1
      })() : true
      return {
        index,
        role: card.classList.contains('card-assistant') ? 'assistant' : 'user',
        height: Math.round(r.height),
        scrollHeight: card.scrollHeight,
        clientHeight: card.clientHeight,
        clipped,
        flexShrink,
        overlapsNext,
        hasSql: !!sql,
        sqlClipped,
        sqlFullyInCard,
        textPreview: (card.innerText||'').replace(/\s+/g,' ').slice(0,80),
      }
    })
    const scrollable = scroll ? scroll.scrollHeight > scroll.clientHeight + 4 : false
    const anyOverlap = items.some(i=>i.overlapsNext)
    const anyCardClip = items.some(i=>i.clipped)
    const shrinkOk = items.every(i=>i.flexShrink === '0')
    return {
      version: document.querySelector('.title-version')?.textContent || '',
      cardCount: cards.length,
      scrollable,
      scrollHeight: scroll?.scrollHeight,
      clientHeight: scroll?.clientHeight,
      anyOverlap,
      anyCardClip,
      shrinkOk,
      items,
    }
  })

  const pass = report.cardCount >= 1 && !report.anyOverlap && !report.anyCardClip && report.shrinkOk
  console.log(JSON.stringify({pass, seeded, report}, null, 2))
  await browser.disconnect()
  if(!pass) process.exit(2)
}
main().catch(e=>{console.error(e); process.exit(1)})
