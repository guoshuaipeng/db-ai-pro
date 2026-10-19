const puppeteer = require('puppeteer-core')
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
;(async()=>{
  const browser = await puppeteer.connect({browserURL:'http://127.0.0.1:9222', defaultViewport:null})
  const pages = await browser.pages()
  const page = pages.find(p=>p.url()&&!p.url().startsWith('devtools://'))||pages[0]
  for(let i=0;i<60;i++){
    const ready=await page.evaluate(()=>!!document.querySelector('.sidebar')&&!document.querySelector('.boot')&&!!document.querySelector('.monaco-editor'))
    if(ready) break
    await sleep(200)
  }
  await sleep(500)

  // Focus monaco and clear any selection via escape / click
  await page.evaluate(()=>{
    const ed=document.querySelector('.monaco-editor')
    ed?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))
  })
  await page.click('.monaco-editor .view-lines', {delay: 20}).catch(()=>{})
  await sleep(200)

  const version = await page.evaluate(()=>document.querySelector('.title-version')?.textContent||'')

  // Simulate drag-select across view-lines: mousedown, move, sample mid-drag, mouseup
  const box = await page.evaluate(()=>{
    const lines = document.querySelector('.monaco-editor .view-lines')
    if(!lines) return null
    const r = lines.getBoundingClientRect()
    return {x:r.left+40, y:r.top+20, w:r.width, h:r.height}
  })
  if(!box){ console.log(JSON.stringify({pass:false, reason:'no view-lines', version})); process.exit(2) }

  await page.mouse.move(box.x, box.y)
  await page.mouse.down()
  // drag across several lines
  const midSamples = []
  for (let step=1; step<=8; step++){
    await page.mouse.move(box.x + Math.min(box.w-20, 40+step*28), box.y + Math.min(box.h-10, 20+step*10), {steps: 2})
    await sleep(40)
    const snap = await page.evaluate(()=>{
      const banner = document.querySelector('.selection-run-banner')
      const text = banner?.textContent || ''
      return {
        hasBanner: !!banner,
        bannerHasRunHint: /将运行选区/.test(text),
        runBtn: [...document.querySelectorAll('button')].find(b=>/运行/.test(b.textContent||''))?.textContent?.trim() || '',
      }
    })
    midSamples.push(snap)
  }
  await page.mouse.up()
  await sleep(220) // settle ms + paint

  const after = await page.evaluate(()=>{
    const banner = document.querySelector('.selection-run-banner')
    const text = banner?.textContent || ''
    return {
      hasBanner: !!banner,
      bannerHasRunHint: /将运行选区/.test(text),
      runBtn: [...document.querySelectorAll('button.run-btn, button')].find(b=>/运行/.test((b.textContent||'')))?.textContent?.trim() || '',
      selectionStatus: [...document.querySelectorAll('*')].map(e=>e.textContent||'').find(t=>/^已选 /.test(t.trim())) || null,
    }
  })

  const interrupted = midSamples.some(s => s.hasBanner || s.bannerHasRunHint)
  const pass = /3\.136\.17/.test(version) && !interrupted && after.hasBanner && after.bannerHasRunHint

  console.log(JSON.stringify({
    pass,
    version,
    interrupted,
    midSamples,
    after,
    policy: 'drag-select must not show banner mid-drag; after mouseup banner OK',
  }, null, 2))
  await browser.disconnect()
  if(!pass) process.exit(2)
})().catch(e=>{console.error(e); process.exit(1)})
