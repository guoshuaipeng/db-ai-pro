const puppeteer = require('puppeteer-core')
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
;(async()=>{
  const browser = await puppeteer.connect({browserURL:'http://127.0.0.1:9222', defaultViewport:null})
  const pages = await browser.pages()
  const page = pages.find(p=>p.url()&&!p.url().startsWith('devtools://'))||pages[0]
  for(let i=0;i<60;i++){
    const ready=await page.evaluate(()=>!!document.querySelector('.workspace')&&!document.querySelector('.boot'))
    if(ready) break
    await sleep(200)
  }
  await sleep(300)
  const version = await page.evaluate(()=>document.querySelector('.title-version')?.textContent||'')

  // Reset sidebar via double-click on splitter
  const split0 = await page.evaluate(()=>{
    const el = document.querySelector('.splitter.is-vertical')
    if(!el) return null
    const r = el.getBoundingClientRect()
    return {x:r.left+r.width/2, y:r.top+r.height/2}
  })
  if(!split0){ console.log(JSON.stringify({pass:false,reason:'no splitter'})); process.exit(2) }
  await page.mouse.click(split0.x, split0.y, {clickCount: 2})
  await sleep(200)

  const before = await page.evaluate(()=>{
    const el = document.querySelector('.splitter.is-vertical')
    const r = el.getBoundingClientRect()
    const cols = getComputedStyle(document.querySelector('.workspace')).gridTemplateColumns
    const sidePx = parseFloat(cols)
    return {x:r.left+r.width/2, y:r.top+r.height/2, sidePx, cols}
  })

  const dragPx = 60
  await page.mouse.move(before.x, before.y)
  await page.mouse.down()
  await page.mouse.move(before.x + dragPx, before.y, {steps: 20})
  await sleep(30)
  await page.mouse.up()
  await sleep(80)

  const after = await page.evaluate(()=>{
    const el = document.querySelector('.splitter.is-vertical')
    const r = el.getBoundingClientRect()
    const cols = getComputedStyle(document.querySelector('.workspace')).gridTemplateColumns
    const sidePx = parseFloat(cols)
    return {x:r.left+r.width/2, sidePx, cols}
  })

  const moved = after.x - before.x
  const widthDelta = after.sidePx - before.sidePx
  const errMove = Math.abs(moved - dragPx)
  const errWidth = Math.abs(widthDelta - dragPx)
  const pass = /3\.136\.18/.test(version) && errMove <= 5 && errWidth <= 5
    && before.sidePx + dragPx <= 400 // stayed under max

  console.log(JSON.stringify({
    pass, version, before, after, dragPx, moved, widthDelta, errMove, errWidth,
    policy: '1:1 track after reset; under sidebarMax'
  }, null, 2))
  await browser.disconnect()
  if(!pass) process.exit(2)
})().catch(e=>{console.error(e); process.exit(1)})
