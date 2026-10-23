interface LogoProps {
  variant?: 'full' | 'compact' | 'emblem';
  className?: string;
}

/** Emblem: a dragon's wings cradling a living flame, ringed in old gold. */
export function Emblem({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="29" fill="#121a13" stroke="#c9963f" strokeWidth="3" />
      <circle
        cx="32"
        cy="32"
        r="24.5"
        fill="none"
        stroke="#c9963f"
        strokeOpacity="0.35"
        strokeWidth="1"
      />
      <path
        d="M31 50c-9-1-17-7-19-18 3 2 6 2.5 8 1.5-3-2.5-4-6.5-3.5-10 2.5 4 5.5 6 8 6.5-1.5-3-1.5-6.5 0-9 1 4 3 7 6.5 8.5z"
        fill="#4f7a3a"
        stroke="#1a120c"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M33 50c9-1 17-7 19-18-3 2-6 2.5-8 1.5 3-2.5 4-6.5 3.5-10-2.5 4-5.5 6-8 6.5 1.5-3 1.5-6.5 0-9-1 4-3 7-6.5 8.5z"
        fill="#3b6a3a"
        stroke="#1a120c"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M32 9c3 7 11 12 11 22a11 11 0 0 1-22 0c0-5.5 3-8.5 4.8-10.6.4 3.4 2 5.2 3.8 5.4C28 20 29.6 13.6 32 9z"
        fill="#e2622b"
        stroke="#1a120c"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M32 24c2 3.6 5.5 5.6 5.5 10a5.5 5.5 0 0 1-11 0c0-2.6 1.6-4.2 2.6-5.2.2 1.6.9 2.5 1.7 2.6-.6-2.6.1-5 1.2-7.4z"
        fill="#f6c45a"
      />
      <path
        d="M32 29.5a3 3 0 1 0 2 5.2"
        fill="none"
        stroke="#fff4d0"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Wordmark logo. Original lettering — not affiliated with any franchise. */
export function Logo({ variant = 'full', className }: LogoProps) {
  if (variant === 'emblem') return <Emblem />;
  const compact = variant === 'compact';
  return (
    <span className={`logo ${compact ? 'logo--compact' : ''} ${className ?? ''}`}>
      <Emblem size={compact ? 38 : 72} />
      <span className="logo__text">
        <span className="logo__title">Dragon Ball</span>
        <span className="logo__subtitle">Forest Chase</span>
      </span>
    </span>
  );
}
