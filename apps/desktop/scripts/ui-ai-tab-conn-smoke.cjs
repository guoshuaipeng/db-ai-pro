const puppeteer = require('puppeteer-core')
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
;(async()=>{
  const browser = await puppeteer.connect({browserURL:'http://127.0.0.1:9222', defaultViewport:null})
  const pages = await browser.pages()
  const page = pages.find(p=>p.url()&&!p.url().startsWith('devtools://'))||pages[0]
  for(let i=0;i<60;i++){
    const ready=await page.evaluate(()=>!!document.querySelector('.sidebar')&&!document.querySelector('.boot'))
    if(ready) break
    await sleep(200)
  }
  await sleep(500)

  // Ensure AI pane open
  await page.evaluate(()=>{
    const btns=[...document.querySelectorAll('button')]
    const ai=btns.find(b=>/助手|AI/.test(b.textContent||'')||(b.title||'').includes('助手'))
    // also try toggle via data attribute / class
  })

  const report = await page.evaluate(async ()=>{
    const version = document.querySelector('.title-version')?.textContent || ''
    // Open AI if closed
    const aiAside = document.querySelector('aside.ai')
    if (!aiAside) {
      const toggles=[...document.querySelectorAll('button,[role="button"]')]
      const hit=toggles.find(el=>/助手/.test(el.textContent||'')||/助手/.test(el.getAttribute('title')||''))
      hit?.dispatchEvent(new MouseEvent('click',{bubbles:true}))
    }
    await new Promise(r=>setTimeout(r,300))

    const sel = document.querySelector('select.tab-conn-select-input')
    const options = sel ? [...sel.options].map(o=>({value:o.value,text:o.text})) : []
    const sample = options.find(o=>o.value==='sample-retail')
    const other = options.find(o=>o.value && o.value!=='sample-retail' && /SQLite|测试/.test(o.text))
      || options.find(o=>o.value && o.value!=='sample-retail')

    const setConn = async (id) => {
      const s = document.querySelector('select.tab-conn-select-input')
      if (!s) return false
      s.value = id
      s.dispatchEvent(new Event('change', {bubbles:true}))
      await new Promise(r=>setTimeout(r,200))
      return true
    }

    const readHint = () => document.querySelector('.ai-conn-hint')?.textContent?.trim() || ''
    const readSel = () => document.querySelector('select.tab-conn-select-input')?.value || ''

    const snaps = []
    if (sample) {
      await setConn(sample.value)
      snaps.push({ step:'sample', tabConn: readSel(), hint: readHint() })
    }
    if (other) {
      await setConn(other.value)
      snaps.push({ step:'other', tabConn: readSel(), hint: readHint(), otherText: other.text })
    }
    if (sample) {
      await setConn(sample.value)
      snaps.push({ step:'back-sample', tabConn: readSel(), hint: readHint() })
    }

    // Table dropdown should not mix unrelated tables when on sample
    const refOpts = [...document.querySelectorAll('select')].find(s=>{
      const lab = s.previousElementSibling?.textContent || s.closest('label')?.textContent || ''
      return /参考/.test(lab)
    })
    const refValues = refOpts ? [...refOpts.options].map(o=>o.text) : []

    return {
      version,
      hasHint: !!document.querySelector('.ai-conn-hint'),
      snaps,
      sampleId: sample?.value,
      otherId: other?.value,
      refValues: refValues.slice(0,12),
      hintNow: readHint(),
      tabNow: readSel(),
    }
  })

  const sampleSnap = report.snaps.find(s=>s.step==='sample'||s.step==='back-sample')
  const otherSnap = report.snaps.find(s=>s.step==='other')
  const hintFollowsTab =
    sampleSnap && /示例业务库|sample/i.test(sampleSnap.hint) &&
    (!otherSnap || otherSnap.hint !== sampleSnap.hint || /当前标签/.test(otherSnap.hint))

  const pass =
    /3\.136\.19/.test(report.version) &&
    report.hasHint &&
    !!report.sampleId &&
    sampleSnap?.tabConn === 'sample-retail' &&
    /示例业务库/.test(sampleSnap.hint) &&
    /当前标签/.test(sampleSnap.hint) &&
    (!otherSnap || (otherSnap.tabConn === report.otherId && otherSnap.hint.includes('当前标签')))

  console.log(JSON.stringify({pass, hintFollowsTab, report, policy:'AI hint follows tab connection; sample only'}, null, 2))
  await browser.disconnect()
  if(!pass) process.exit(2)
})().catch(e=>{console.error(e); process.exit(1)})
