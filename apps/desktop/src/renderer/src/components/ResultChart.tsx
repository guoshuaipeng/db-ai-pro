import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzeChartData, type ChartModel } from '@shared/chartData'

export type ChartKind = 'bar' | 'line'

const SERIES_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24']

function drawChart(
  canvas: HTMLCanvasElement,
  model: ChartModel,
  kind: ChartKind,
  width: number,
  height: number,
): void {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(width * dpr))
  canvas.height = Math.max(1, Math.floor(height * dpr))
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const pad = { top: 28, right: 16, bottom: 44, left: 52 }
  const plotW = Math.max(10, width - pad.left - pad.right)
  const plotH = Math.max(10, height - pad.top - pad.bottom)

  const allValues = model.series.flatMap((series) => series.values)
  let min = Math.min(0, ...allValues)
  let max = Math.max(...allValues, 0)
  if (min === max) {
    min -= 1
    max += 1
  }
  const span = max - min || 1

  // background
  ctx.fillStyle = 'rgba(15, 23, 42, 0.35)'
  ctx.fillRect(0, 0, width, height)

  // grid + y labels
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)'
  ctx.fillStyle = 'rgba(148, 163, 184, 0.85)'
  ctx.font = '11px Inter, system-ui, sans-serif'
  ctx.lineWidth = 1
  const ticks = 4
  for (let i = 0; i <= ticks; i += 1) {
    const t = i / ticks
    const y = pad.top + plotH * (1 - t)
    const value = min + span * t
    ctx.beginPath()
    ctx.moveTo(pad.left, y)
    ctx.lineTo(pad.left + plotW, y)
    ctx.stroke()
    const label = Number.isInteger(value) ? String(value) : value.toFixed(1)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, pad.left - 8, y)
  }

  const n = model.labels.length
  if (!n) return

  const yAt = (value: number) => pad.top + plotH * (1 - (value - min) / span)

  if (kind === 'bar') {
    const groupW = plotW / n
    const seriesCount = model.series.length
    const barW = Math.max(2, Math.min(18, (groupW * 0.7) / seriesCount))
    model.series.forEach((series, seriesIndex) => {
      ctx.fillStyle = SERIES_COLORS[seriesIndex % SERIES_COLORS.length]
      series.values.forEach((value, index) => {
        const x =
          pad.left +
          groupW * index +
          (groupW - barW * seriesCount) / 2 +
          barW * seriesIndex
        const y0 = yAt(0)
        const y1 = yAt(value)
        const top = Math.min(y0, y1)
        const h = Math.max(1, Math.abs(y1 - y0))
        ctx.fillRect(x, top, barW, h)
      })
    })
  } else {
    model.series.forEach((series, seriesIndex) => {
      const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length]
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      series.values.forEach((value, index) => {
        const x = pad.left + (n === 1 ? plotW / 2 : (plotW * index) / (n - 1))
        const y = yAt(value)
        if (index === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.fillStyle = color
      series.values.forEach((value, index) => {
        const x = pad.left + (n === 1 ? plotW / 2 : (plotW * index) / (n - 1))
        const y = yAt(value)
        ctx.beginPath()
        ctx.arc(x, y, 2.5, 0, Math.PI * 2)
        ctx.fill()
      })
    })
  }

  // x labels (sparse)
  ctx.fillStyle = 'rgba(148, 163, 184, 0.9)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const step = Math.max(1, Math.ceil(n / 8))
  for (let i = 0; i < n; i += step) {
    const x =
      kind === 'bar'
        ? pad.left + (plotW / n) * i + plotW / n / 2
        : pad.left + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1))
    ctx.fillText(model.labels[i] ?? '', x, pad.top + plotH + 10)
  }

  // legend
  let legendX = pad.left
  const legendY = 8
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  model.series.forEach((series, index) => {
    const color = SERIES_COLORS[index % SERIES_COLORS.length]
    ctx.fillStyle = color
    ctx.fillRect(legendX, legendY, 10, 10)
    ctx.fillStyle = 'rgba(226, 232, 240, 0.92)'
    ctx.fillText(series.key, legendX + 14, legendY + 5)
    legendX += Math.min(160, 24 + ctx.measureText(series.key).width + 16)
  })
}

export function ResultChart({
  columns,
  rows,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
}) {
  const analysis = useMemo(() => analyzeChartData(columns, rows), [columns, rows])
  const [kind, setKind] = useState<ChartKind>('bar')
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 640, h: 280 })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const w = Math.max(240, Math.floor(entry.contentRect.width))
      const h = Math.max(200, Math.floor(entry.contentRect.height))
      setSize({ w, h })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!analysis.ok || !canvasRef.current) return
    drawChart(canvasRef.current, analysis, kind, size.w, size.h)
  }, [analysis, kind, size])

  if (!analysis.ok) {
    return (
      <div className="chart-empty" role="status">
        <p>当前结果不适合绘图</p>
        <span>{analysis.reason}</span>
      </div>
    )
  }

  return (
    <div className="chart-pane" ref={wrapRef}>
      <div className="chart-toolbar">
        <div className="chart-kind" role="group" aria-label="图表类型">
          <button
            type="button"
            className={kind === 'bar' ? 'btn btn-ghost tiny-btn is-active' : 'btn btn-ghost tiny-btn'}
            onClick={() => setKind('bar')}
          >
            柱状
          </button>
          <button
            type="button"
            className={kind === 'line' ? 'btn btn-ghost tiny-btn is-active' : 'btn btn-ghost tiny-btn'}
            onClick={() => setKind('line')}
          >
            折线
          </button>
        </div>
        <span className="chart-meta">
          {analysis.labelColumn ? `横轴：${analysis.labelColumn}` : '横轴：行号'}
          {analysis.truncated ? ` · 已截取前 120 / ${analysis.rowCount} 行` : ` · ${analysis.rowCount} 行`}
        </span>
      </div>
      <canvas ref={canvasRef} className="chart-canvas" role="img" aria-label="结果图表" />
    </div>
  )
}
