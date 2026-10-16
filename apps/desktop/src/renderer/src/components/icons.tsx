import type { ReactNode } from 'react'
import appMark from '../assets/app-mark.png'

type IconProps = { size?: number }

function Svg({ size = 16, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {children}
    </svg>
  )
}

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function Mark({ size = 24 }: { size?: number }) {
  return (
    <img
      className="mark"
      src={appMark}
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  )
}

export function IconSearch() {
  return (
    <Svg>
      <circle cx="7" cy="7" r="3.25" {...stroke} />
      <path d="M9.6 9.6 13 13" {...stroke} />
    </Svg>
  )
}

export function IconPlus() {
  return (
    <Svg>
      <path d="M8 3.5v9M3.5 8h9" {...stroke} />
    </Svg>
  )
}

export function IconStop() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  )
}

export function IconPlay() {
  return (
    <Svg size={14}>
      <path d="M5.5 3.8v8.4L12.2 8 5.5 3.8Z" fill="currentColor" />
    </Svg>
  )
}

export function IconDatabase() {
  return (
    <Svg>
      <ellipse cx="8" cy="4.2" rx="4.2" ry="1.7" {...stroke} />
      <path d="M3.8 4.2v7.2c0 .9 1.9 1.7 4.2 1.7s4.2-.8 4.2-1.7V4.2" {...stroke} />
      <path d="M3.8 8c0 .9 1.9 1.7 4.2 1.7s4.2-.8 4.2-1.7" {...stroke} />
    </Svg>
  )
}

export function IconTable() {
  return (
    <Svg>
      <rect x="2.75" y="3" width="10.5" height="10" rx="1.4" {...stroke} />
      <path d="M2.75 6.4h10.5M6.6 6.4V13" {...stroke} />
    </Svg>
  )
}

export function IconSidebar() {
  return (
    <Svg>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" {...stroke} />
      <path d="M6.2 3.2v9.6" {...stroke} />
    </Svg>
  )
}

export function IconSpark() {
  return (
    <Svg>
      <path d="M8 2.6 9.1 6.4 13 7.4 9.1 8.6 8 12.4 6.9 8.6 3 7.4 6.9 6.4 8 2.6Z" {...stroke} />
    </Svg>
  )
}

export function IconColumn() {
  return (
    <Svg size={14}>
      <path d="M4 3.2h8M4 8h8M4 12.8h5" {...stroke} />
    </Svg>
  )
}

export function IconMore() {
  return (
    <Svg>
      <circle cx="4" cy="8" r="0.9" fill="currentColor" />
      <circle cx="8" cy="8" r="0.9" fill="currentColor" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" />
    </Svg>
  )
}

export function IconStar() {
  return (
    <Svg>
      <path d="M8 2.8 9.4 6.2 13.1 6.6 10.4 9.1 11.2 12.8 8 11 4.8 12.8 5.6 9.1 2.9 6.6 6.6 6.2 8 2.8Z" {...stroke} />
    </Svg>
  )
}

export function IconClock() {
  return (
    <Svg>
      <circle cx="8" cy="8" r="5.25" {...stroke} />
      <path d="M8 5.2v3.2l2.2 1.4" {...stroke} />
    </Svg>
  )
}

export function IconSend() {
  return (
    <Svg size={15}>
      <path d="M3 8h10M9.2 4.2 13 8l-3.8 3.8" {...stroke} />
    </Svg>
  )
}

