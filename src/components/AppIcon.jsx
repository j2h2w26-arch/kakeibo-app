const paths = {
  home: <><path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" /></>,
  money: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 9h18M14 14h4" /></>,
  shopping: <><path d="M4 11.5 12 5l8 6.5V21H4Z" /><path d="M8 21v-6h8v6M9 10h6" /></>,
  wishes: <path d="M12 21 3.5 12.5C-2 6 6 0 12 7c6-7 14-1 8.5 5.5Z" />,
  points: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />,
  check: <path d="m5 12 4 4L19 6" />,
  camera: <><path d="M8 6 10 3h4l2 3h5v15H3V6Z" /><circle cx="12" cy="13" r="4" /></>,
}

export function AppIcon({ name, size = 24 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] || paths.home}</svg>
}
