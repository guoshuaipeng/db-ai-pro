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
  await sleep(800)

  const core = await page.evaluate(async ()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
    const version=document.querySelector('.title-version')?.textContent||''
    if(!document.querySelector('aside.ai')){
      [...document.querySelectorAll('button')].find(b=>/助手/.test(b.textContent||''))?.click()
      await sleep(350)
    }
    const clear=()=>[...document.querySelectorAll('aside.ai button')].find(b=>/清空/.test(b.textContent||''))?.click()
    clear(); await sleep(300)
    ;[...document.querySelectorAll('.intent-tabs button')].find(b=>/查询/.test(b.textContent||''))?.click()
    await sleep(100)

    const connSelect=()=>document.querySelector('select.tab-conn-select-input')
    const setTabConn=async(id)=>{
      const s=connSelect(); if(!s) return false
      s.value=id; s.dispatchEvent(new Event('change',{bubbles:true})); await sleep(280); return true
    }
    const aiId=()=>document.querySelector('.ai-conn-hint')?.getAttribute('data-ai-connection-id')||''
    const lastTurnConn=()=>{
      const cards=[...document.querySelectorAll('aside.ai article[data-ai-turn-connection]')]
      const last=cards[cards.length-1]
      return last?.getAttribute('data-ai-turn-connection')||''
    }
    const sendChip=async()=>{
      const chip=[...document.querySelectorAll('aside.ai button.chip')].find(b=>(b.textContent||'').trim())
      if(!chip) return false
      chip.click(); await sleep(1200); return true
    }

    const opts=[...(connSelect()?.options||[])].map(o=>({value:o.value,text:o.text}))
    const sample=opts.find(o=>o.value==='sample-retail')
    const other=opts.find(o=>o.value&&o.value!=='sample-retail'&&/SQLite/.test(o.text))||opts.find(o=>o.value&&o.value!=='sample-retail')
    if(!sample||!other) return {ok:false,reason:'need two conns',version,opts}

    await setTabConn(sample.value)
    const hintSample=aiId()
    await sendChip()
    const turnSample=lastTurnConn()

    clear(); await sleep(300)
    await setTabConn(other.value)
    const hintOther=aiId()
    await sendChip()
    const turnOther=lastTurnConn()

    // execute on sample while tree points elsewhere
    clear(); await sleep(250)
    await setTabConn(sample.value)
    await sendChip()
    await sleep(400)
    const otherRow=[...document.querySelectorAll('.sidebar .tree-row')].find(r=>{
      const id=r.getAttribute('data-tree-node-id')||''
      return id&&id!==sample.value&&!id.includes(':')
    })
    otherRow?.click(); await sleep(250)
    const beforeExec={tab:connSelect()?.value, ai:aiId(), turn:lastTurnConn()}
    const execBtn=[...document.querySelectorAll('aside.ai button')].find(b=>/一键执行/.test(b.textContent||''))
    let execOk=false, execMsg=''
    if(execBtn){
      execBtn.click(); await sleep(1800)
      const body=document.body.innerText
      execMsg=(document.querySelector('.message-log,.messages')?.innerText||body).slice(0,400)
      execOk=!/snowy-cloud\.customers|blocked non-sample|当前标签未绑定/.test(execMsg)
        && !/Table '.*customers' doesn't exist/i.test(execMsg)
    }

    // tree vs tab send
    clear(); await sleep(250)
    await setTabConn(sample.value)
    otherRow?.click(); await sleep(250)
    await sendChip()
    const afterTreeTurn=lastTurnConn()
    const afterTreeHint=aiId()

    const side=document.querySelector('.sidebar')?.innerText||''
    const searchVal=document.querySelector('.sidebar input')?.value||''
    const emptyMismatch=/没有匹配的对象/.test(side)&&!String(searchVal).trim()
    const loadingWhileTree=/正在加载对象树/.test(side)&&document.querySelectorAll('.sidebar .tree-row').length>0

    return {
      ok:true, version, sample:sample.value, other:other.value,
      hintSample, hintOther, turnSample, turnOther,
      beforeExec, execClicked:!!execBtn, execOk, execMsg:execMsg.slice(0,220),
      afterTreeTurn, afterTreeHint, treeClicked:!!otherRow,
      emptyMismatch, loadingWhileTree,
    }
  })

  // selection
  await page.keyboard.press('Escape')
  await sleep(80)
  let selectionReg={skipped:true}
  const box=await page.evaluate(()=>{
    const lines=document.querySelector('.monaco-editor .view-lines')
    if(!lines) return null
    const r=lines.getBoundingClientRect()
    return {x:r.left+48,y:r.top+18}
  })
  if(box){
    await page.mouse.click(box.x, box.y)
    await sleep(80)
    await page.mouse.move(box.x, box.y)
    await page.mouse.down()
    const mid=[]
    for(let s=1;s<=5;s++){
      await page.mouse.move(box.x+s*25, box.y+s*8,{steps:1})
      await sleep(30)
      mid.push(await page.evaluate(()=>!!document.querySelector('.selection-run-banner')))
    }
    await page.mouse.up()
    await sleep(250)
    selectionReg={skipped:false, midHadBanner:mid.some(Boolean), afterBanner:await page.evaluate(()=>!!document.querySelector('.selection-run-banner'))}
  }

  const runHover=await page.evaluate(()=>{
    const btn=[...document.querySelectorAll('button')].find(b=>{
      const t=(b.textContent||'').replace(/\s+/g,' ').trim()
      return t==='运行'||t.startsWith('运行 ')||t==='运行选区'||t.startsWith('运行选区')
    })
    if(!btn) return {found:false}
    btn.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}))
    const hover=getComputedStyle(btn)
    const parse=c=>{const m=c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m?[+m[1],+m[2],+m[3]]:null}
    const bc=parse(hover.color), bg=parse(hover.backgroundColor)
    let contrastOk=true
    if(bc&&bg){const lum=([r,g,b])=>0.2126*r+0.7152*g+0.0722*b; contrastOk=Math.abs(lum(bc)-lum(bg))>50}
    return {found:true, label:btn.textContent.trim(), primary:btn.classList.contains('btn-primary'), contrastOk}
  })

  const pass =
    core.ok &&
    /3\.136\.19/.test(core.version) &&
    core.hintSample===core.sample &&
    core.hintOther===core.other &&
    core.turnSample===core.sample &&
    core.turnOther===core.other &&
    core.execClicked && core.execOk &&
    core.beforeExec.tab===core.sample &&
    core.afterTreeHint===core.sample &&
    core.afterTreeTurn===core.sample &&
    !core.emptyMismatch && !core.loadingWhileTree &&
    (selectionReg.skipped || (!selectionReg.midHadBanner && selectionReg.afterBanner)) &&
    runHover.found && runHover.primary && runHover.contrastOk

  console.log(JSON.stringify({pass, core, selectionReg, runHover, policy:'turn connectionId stamp + execute vs tree; sample/test only'}, null, 2))
  await browser.disconnect()
  if(!pass) process.exit(2)
})().catch(e=>{console.error(e); process.exit(1)})
