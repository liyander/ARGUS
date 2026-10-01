/** Minimal stroke icon set (24×24, lucide-style) so we don't ship an icon library. */
const PATHS: Record<string, string> = {
  overview: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  architecture: 'M5 3h4v4H5zM15 3h4v4h-4zM10 17h4v4h-4zM7 7v3a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7M12 12v5',
  galaxy: 'M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4.9 4.9c3.9-1.6 9.2.8 11.6 5.3s1.3 8.9-2.6 9.9-9.2-.8-11.6-5.3-1.3-8.9 2.6-9.9M19 5h.01M5 19h.01M20 16h.01',
  endpoints: 'M4 6h16M4 12h10M4 18h7M17 15l3 3-3 3',
  dependencies: 'M12 2l8 4.5v9L12 20l-8-4.5v-9zM12 11l8-4.5M12 11v9M12 11L4 6.5',
  treemap: 'M3 3h18v18H3zM3 12h9M12 3v18M12 15h9M16 15v6',
  thirdparties: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2L19 19M5 19l2.8-2.8M16.2 7.8L19 5',
  dots: 'M5 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M19 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M19 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 11l10-4M7 13l10 4M12 9.2m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  search: 'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-4.3-4.3',
  close: 'M18 6L6 18M6 6l12 12',
  sun: 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  key: 'M15.5 7.5m-5.5 0a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0-11 0M11.4 11.6L3 20v1h3l1-1v-2h2v-2h2l1.4-1.4',
  github: 'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3.1-.4 6.4-1.5 6.4-6.9a5.4 5.4 0 0 0-1.5-3.7 5 5 0 0 0-.1-3.7s-1.2-.4-3.9 1.4a13.3 13.3 0 0 0-7 0C6.3 1.6 5.1 2 5.1 2a5 5 0 0 0-.1 3.7 5.4 5.4 0 0 0-1.5 3.7c0 5.4 3.3 6.5 6.4 6.9a3.4 3.4 0 0 0-.9 2.6V22',
  globe: 'M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  share: 'M18 5m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M6 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M18 19m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  alert: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  check: 'M20 6L9 17l-5-5',
  focus: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3',
  terminal: 'M4 17l6-6-6-6M12 19h8',
  chevron: 'M9 18l6-6-6-6',
  chevronDown: 'M6 9l6 6 6-6',
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  layers: 'M12 2L2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  compare: 'M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7',
  copy: 'M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  image: 'M3 3h18v18H3zM8.5 8.5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M21 15l-5-5L5 21',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  info: 'M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0M12 16v-4M12 8h.01',
  bolt: 'M13 2L3 14h9l-1 8 10-12h-9z',
  database: 'M12 5m-8 0a8 3 0 1 0 16 0a8 3 0 1 0-16 0M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  server: 'M3 3h18v7H3zM3 14h18v7H3zM7 6.5h.01M7 17.5h.01',
  cloud: 'M17.5 19a4.5 4.5 0 1 0-1.4-8.8A7 7 0 1 0 6 19z',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3.3 7.6L12 12.5l8.7-4.9M12 22V12.5',
  stop: 'M6 6h12v12H6z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  filter: 'M22 3H2l8 9.5V19l4 2v-8.5z',
};

export function Icon({ name, size = 16, className, strokeWidth = 1.75 }: { name: string; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}
