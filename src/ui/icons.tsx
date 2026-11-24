// Minimal stroke icon set (24px grid).
import type { JSX } from 'react'

const P: Record<string, JSX.Element> = {
  map: <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14" />,
  villa: <path d="M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6" />,
  building: <path d="M5 21V4h9v17M14 9h5v12M8 8h3M8 12h3M8 16h3M3 21h18" />,
  pool: <path d="M3 17c2 0 2 1.5 4.5 1.5S10 17 12 17s2 1.5 4.5 1.5S19 17 21 17M7 14V6a2 2 0 0 1 4 0m2 8V6a2 2 0 0 1 4 0M7 9h6" />,
  court: <path d="M3 5h18v14H3zM12 5v14M3 9h3v6H3m18-6h-3v6h3M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />,
  play: <path d="M4 20V8l4-4 4 4v12M4 12h8M12 9l8 8M17 20v-3M3 20h18" />,
  lounge: <path d="M4 12V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 12h18v5H3zM5 17v2m14-2v2" />,
  boat: <path d="M3 17h18l-2.5 4h-13L3 17Zm9-14v12m0-12 6 10H12m0-8L7 13h5M2 21c1.5 0 2-1 3.5-1S8 21 9.5 21s2-1 3.5-1 2 1 3.5 1 2-1 3.5-1" />,
  wave: <path d="M2 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />,
  dive: <path d="M3 4h7v4M10 8l5 5-3 4m3-4 4 1M16 7a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 16 7ZM2 21c2.5 0 2.5-1.5 5-1.5S9.500 21 12 21s2.500-1.500 5-1.500S19.500 21 22 21" />,
  tree: <path d="M12 22v-6m0 0c-5 0-8-2.500-8-5.500C4 8 6 7 7 7c0-3 2.500-5 5-5s5 2 5 5c1 0 3 1 3 3.500 0 3-3 5.500-8 5.500Zm0 0 3-3" />,
  beach: <path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9Zm0 9 4 9M2 21h20" />,
  sun: <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />,
  sunset: <path d="M12 3v3m-7.8 3.2 2.1 2.1m13.5-2.1-2.1 2.1M2 17h20M7 17a5 5 0 0 1 10 0M4 21h16" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  chevL: <path d="m15 6-6 6 6 6" />,
  chevR: <path d="m9 6 6 6-6 6" />,
  chevD: <path d="m6 9 6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  layers: <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" />,
  people: <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 10v-1a6 6 0 0 1 12 0v1m2-10a3 3 0 1 0 0-6m2 16v-1a5 5 0 0 0-3-4.6" />,
  tag: <path d="M3 12V4h8l10 10-8 8L3 12Zm5-4h.01" />,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5" />,
  bed: <path d="M3 18V7m0 5h18v6M3 14h18M7 12V9h5v3" />,
  bath: <path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-3Zm2 0V5a2 2 0 0 1 4 0M7 20l-1 2m11-2 1 2" />,
  car: <path d="M5 16h14l-1.5-6.5A2 2 0 0 0 15.5 8h-7a2 2 0 0 0-2 1.5L5 16Zm0 0v3h2v-3m10 0v3h2v-3M7.5 13h.01m9 0h.01" />,
  area: <path d="M4 4h16v16H4zM4 9h5V4m11 11h-5v5" />,
  eye: <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
  terrace: <path d="M3 20h18M5 20v-8h14v8M3 12l9-7 9 7" />,
  plot: <path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm9 4v10M3 7l9 4 9-4" />,
  floor: <path d="M4 20h16M4 15h16M4 10h16M4 5h16" />,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />,
  mail: <path d="M3 6h18v12H3zM3 7l9 6 9-6" />,
  calendar: <path d="M4 6h16v14H4zM4 10h16M8 3v5m8-5v5" />,
  pin: <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
  arrowL: <path d="M19 12H5m6-6-6 6 6 6" />,
  download: <path d="M12 4v11m-5-5 5 5 5-5M4 20h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  doc: <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7" />,
  check: <path d="m5 12 5 5 9-10" />,
  spark: <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6" />,
}

export function Icon({ name, size = 18, className = '' }: { name: keyof typeof P | string; size?: number; className?: string }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[name] ?? P.spark}
    </svg>
  )
}
