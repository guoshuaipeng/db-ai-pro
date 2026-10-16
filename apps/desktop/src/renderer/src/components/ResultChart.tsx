import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzeChartData, type ChartModel } from '@shared/chartData'
import {
  chartAxisMeta,
  chartBarLabel,
  chartCopySummaryLabel,
  chartExportPngLabel,
  chartKicker,
  chartLineLabel,
  chartPngFailedToast,
  chartPngSavedToast,
  chartSeriesToggleHint,
  chartSkipFromAnalysis,
  chartSummaryCopiedToast,
  formatChartSummaryClipboard,
} from '@shared/chartUi'
import { useWorkspace } from '../state/workspace'
import { EmptyState } from './EmptyState'

export type ChartKind = 'bar' | 'line'

const SERIES_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24']

function drawChart(
  canvas: HTMLCanvasElement,
  model: ChartModel,
  kind: ChartKind,
  width: number,
  height: number,
  visibleKeys: Set<string>,
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

  const series = model.series.filter((row) => visibleKeys.has(row.key))
  const allValues = series.flatMap((row) => row.values)
  let min = Math.min(0, ...(allValues.length ? allValues : [0]))
  let max = Math.max(...(allValues.length ? allValues : [0]), 0)
  if (min === max) {
    min -= 1
    max += 1
  }
  const span = max - min || 1

  ctx.fillStyle = 'rgba(15, 23, 42, 0.35)'
  ctx.fillRect(0, 0, width, height)

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

  if (series.length === 0) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.85)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('已隐藏全部系列', pad.left + plotW / 2, pad.top + plotH / 2)
  } else if (kind === 'bar') {
    const groupW = plotW / n
    const seriesCount = series.length
    const barW = Math.max(2, Math.min(18, (groupW * 0.7) / seriesCount))
    series.forEach((row, seriesIndex) => {
      const colorIndex = model.series.findIndex((s) => s.key === row.key)
      ctx.fillStyle = SERIES_COLORS[(colorIndex >= 0 ? colorIndex : seriesIndex) % SERIES_COLORS.length]
      row.values.forEach((value, index) => {
        const x =
          pad.left + groupW * index + (groupW - barW * seriesCount) / 2 + barW * seriesIndex
        const y0 = yAt(0)
        const y1 = yAt(value)
        const top = Math.min(y0, y1)
        const h = Math.max(1, Math.abs(y1 - y0))
        ctx.fillRect(x, top, barW, h)
      })
    })
  } else {
    series.forEach((row, seriesIndex) => {
      const colorIndex = model.series.findIndex((s) => s.key === row.key)
      const color = SERIES_COLORS[(colorIndex >= 0 ? colorIndex : seriesIndex) % SERIES_COLORS.length]
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      row.values.forEach((value, index) => {
        const x = pad.left + (n === 1 ? plotW / 2 : (plotW * index) / (n - 1))
        const y = yAt(value)
        if (index === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.fillStyle = color
      row.values.forEach((value, index) => {
        const x = pad.left + (n === 1 ? plotW / 2 : (plotW * index) / (n - 1))
        const y = yAt(value)
        ctx.beginPath()
        ctx.arc(x, y, 2.5, 0, Math.PI * 2)
        ctx.fill()
      })
    })
  }

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

  let legendX = pad.left
  const legendY = 8
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  series.forEach((row) => {
    const colorIndex = model.series.findIndex((s) => s.key === row.key)
    const color = SERIES_COLORS[(colorIndex >= 0 ? colorIndex : 0) % SERIES_COLORS.length]
    ctx.fillStyle = color
    ctx.fillRect(legendX, legendY, 10, 10)
    ctx.fillStyle = 'rgba(226, 232, 240, 0.92)'
    ctx.fillText(row.key, legendX + 14, legendY + 5)
    legendX += Math.min(160, 24 + ctx.measureText(row.key).width + 16)
  })
}

export function ResultChart({
  columns,
  rows,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
}) {
  const ws = useWorkspace()
  const analysis = useMemo(() => analyzeChartData(columns, rows), [columns, rows])
  const [kind, setKind] = useState<ChartKind>('bar')
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 640, h: 280 })
  const [hiddenSeries, setHiddenSeries] = useState<string[]>([])

  useEffect(() => {
    setHiddenSeries([])
  }, [columns, rows])

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

  const visibleKeys = useMemo(() => {
    if (!analysis.ok) return new Set<string>()
    return new Set(analysis.series.map((s) => s.key).filter((key) => !hiddenSeries.includes(key)))
  }, [analysis, hiddenSeries])

  useEffect(() => {
    if (!analysis.ok || !canvasRef.current) return
    drawChart(canvasRef.current, analysis, kind, size.w, size.h, visibleKeys)
  }, [analysis, kind, size, visibleKeys])

  if (!analysis.ok) {
    const empty = chartSkipFromAnalysis(analysis)
    return (
      <div className="chart-empty" role="status">
        <EmptyState compact kicker={chartKicker()} title={empty.title} body={empty.body} />
      </div>
    )
  }

  const toggleSeries = (key: string) => {
    setHiddenSeries((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    )
  }

  const copySummary = () => {
    const text = formatChartSummaryClipboard(analysis, kind)
    void navigator.clipboard.writeText(text).then(
      () => ws.pushToast('success', chartSummaryCopiedToast()),
      () => ws.pushToast('error', '复制失败'),
    )
  }

  const exportPng = () => {
    const canvas = canvasRef.current
    if (!canvas) {
      ws.pushToast('error', chartPngFailedToast())
      return
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        ws.pushToast('error', chartPngFailedToast())
        return
      }
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `dataai-chart-${kind}.png`
      anchor.click()
      URL.revokeObjectURL(url)
      ws.pushToast('success', chartPngSavedToast())
    }, 'image/png')
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
            {chartBarLabel()}
          </button>
          <button
            type="button"
            className={kind === 'line' ? 'btn btn-ghost tiny-btn is-active' : 'btn btn-ghost tiny-btn'}
            onClick={() => setKind('line')}
          >
            {chartLineLabel()}
          </button>
        </div>
        <span className="chart-meta">{chartAxisMeta(analysis)}</span>
        <div className="chart-toolbar-actions">
          <button type="button" className="btn btn-ghost tiny-btn" onClick={copySummary}>
            {chartCopySummaryLabel()}
          </button>
          <button type="button" className="btn btn-ghost tiny-btn" onClick={exportPng}>
            {chartExportPngLabel()}
          </button>
        </div>
      </div>
      {analysis.series.length > 1 ? (
        <div className="chart-series" role="group" aria-label={chartSeriesToggleHint()}>
          {analysis.series.map((series, index) => {
            const on = !hiddenSeries.includes(series.key)
            return (
              <button
                key={series.key}
                type="button"
                className={on ? 'chart-series-chip is-on' : 'chart-series-chip'}
                aria-pressed={on}
                style={{ ['--chart-series-color' as string]: SERIES_COLORS[index % SERIES_COLORS.length] }}
                onClick={() => toggleSeries(series.key)}
                title={chartSeriesToggleHint()}
              >
                {series.key}
              </button>
            )
          })}
        </div>
      ) : null}
      <canvas ref={canvasRef} className="chart-canvas" role="img" aria-label="结果图表" />
    </div>
  )
}
