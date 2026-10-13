const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  roster: 'M16 11a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0M12 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  games: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M5.6 6.6c2.2 1.5 3.4 3.4 3.4 5.4s-1.2 3.9-3.4 5.4M18.4 6.6C16.2 8.1 15 10 15 12s1.2 3.9 3.4 5.4',
  office: 'M4 7h16v13H4zM9 7V4h6v3M4 12h16',
  league: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  play: 'M7 4.5v15l12-7.5z',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5h-4L10.7 6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4z',
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 8v5M12 16.5v.5M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  trade: 'M4 8h13l-3-3M20 16H7l3 3',
  money: 'M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.7 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3',
  draft: 'M9 4h6l1 3H8zM6 7h12v13H6zM9 12h6M9 16h4',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4',
  staff: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M17 11a2.5 2.5 0 1 0 0-5M3 20a6 6 0 0 1 12 0M16 14a5 5 0 0 1 5 6',
  pen: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  up: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  down: 'M3 7l6 6 4-4 8 8M15 17h6v-6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
