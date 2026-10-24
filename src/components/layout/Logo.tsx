export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--elevated)" stroke="var(--border-strong)" />
      <path d="M9 22.5 15.2 9.5h3.1L12.1 22.5z" fill="var(--accent)" />
      <path d="M15.6 22.5 19.4 14.6h3.1L18.7 22.5z" fill="var(--accent)" opacity=".55" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-baseline gap-1.5 leading-none select-none">
      <span className="text-[15px] font-semibold tracking-[0.18em] text-fg">FLUX</span>
      <span className="text-[10px] font-medium tracking-[0.28em] text-muted">FINANCE</span>
    </span>
  );
}
