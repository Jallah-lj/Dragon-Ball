import type { ReactElement, SVGProps } from 'react';

/** Hand-drawn icon set (24×24, currentColor). Purely decorative unless titled. */
export type IconName =
  | 'flame'
  | 'leaf'
  | 'shield'
  | 'crystal'
  | 'scale'
  | 'crown'
  | 'trophy'
  | 'team'
  | 'bolt'
  | 'compass'
  | 'thorn'
  | 'user'
  | 'settings'
  | 'play'
  | 'lock'
  | 'check'
  | 'alert'
  | 'info'
  | 'close'
  | 'menu'
  | 'copy'
  | 'share'
  | 'logout'
  | 'refresh'
  | 'arrow'
  | 'back'
  | 'offline'
  | 'heart'
  | 'clock'
  | 'path'
  | 'flag'
  | 'link'
  | 'wing'
  | 'race'
  | 'book';

const paths: Record<IconName, ReactElement> = {
  flame: (
    <path d="M12 2c2 4 6 6.5 6 11.5a6 6 0 0 1-12 0c0-3 1.6-4.8 2.6-6 .3 2 1.3 3 2.4 3-1-3.5 0-6.3 1-8.5z" />
  ),
  leaf: (
    <>
      <path d="M5 19C5 10 10 5 20 4c0 9-5 15-13 15z" />
      <path d="M5 19c4-5 7-8 11-11" fill="none" />
    </>
  ),
  shield: (
    <path d="M12 3c3 1.8 5.5 2.2 8 2.2 0 8-3 12.6-8 15.8-5-3.2-8-7.8-8-15.8 2.5 0 5-.4 8-2.2z" />
  ),
  crystal: (
    <>
      <path d="M12 2l6 6-3 14H9L6 8z" />
      <path d="M12 2l1.5 6L12 22M6 8h12" fill="none" />
    </>
  ),
  scale: (
    <>
      <path d="M12 3c5 1.5 7 5 6 10-1 4.5-4 7-6 8-2-1-5-3.5-6-8-1-5 1-8.5 6-10z" />
      <path d="M8 10c2.5 1.5 5.5 1.5 8 0M8.5 14c2 1.3 5 1.3 7 0" fill="none" />
    </>
  ),
  crown: <path d="M4 18l-1-10 5 4 4-7 4 7 5-4-1 10zM4 21h16" />,
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path
        d="M7 6H4c0 3 1.5 4.5 3.5 4.7M17 6h3c0 3-1.5 4.5-3.5 4.7M12 14v4M8 21h8M9 18h6"
        fill="none"
      />
    </>
  ),
  team: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16.5" cy="9" r="2.5" />
      <path d="M2.5 20c.5-4 3-6 5.5-6s5 2 5.5 6zM13 20c.3-2.6 1.6-5 3.5-5s3.6 2 4 5z" />
    </>
  ),
  bolt: <path d="M13 2L5 13h6l-1 9 8-11h-6z" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
  thorn: <path d="M4 20c4-1 7-4 9-8l3-1-2-1 1-4-3 3-1-2-1 3c-2 4-4 7-6 10z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c.7-4.6 4-7 8-7s7.3 2.4 8 7z" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" fill="none" />
      <path
        d="M12 2.5l1.6 2.6 3-.6.7 3 2.7 1.3-1.2 2.8 1.2 2.8-2.7 1.3-.7 3-3-.6L12 21.5l-1.6-2.4-3 .6-.7-3-2.7-1.3L5.2 12 4 9.2l2.7-1.3.7-3 3 .6z"
        fill="none"
      />
    </>
  ),
  play: <path d="M7 4l13 8-13 8z" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" />
    </>
  ),
  check: <path d="M4 12.5l5 5L20 6.5" fill="none" />,
  alert: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 9v5M12 17v.5" fill="none" stroke="var(--ink-950, #0d120e)" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" />
      <path d="M12 11v6M12 7.5v.5" fill="none" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" fill="none" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" fill="none" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" fill="none" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" fill="none" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 11l7.6-4M8.2 13l7.6 4" fill="none" />
    </>
  ),
  logout: <path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" fill="none" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" fill="none" />,
  arrow: <path d="M4 12h15M13 6l6 6-6 6" fill="none" />,
  back: <path d="M20 12H5M11 6l-6 6 6 6" fill="none" />,
  offline: (
    <>
      <path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0" fill="none" />
      <path d="M3 3l18 18" fill="none" />
    </>
  ),
  heart: (
    <path d="M12 20s-8-4.6-8-10.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8 3.5C20 15.4 12 20 12 20z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" />
      <path d="M12 7v5l3 2" fill="none" />
    </>
  ),
  path: <path d="M5 21c0-5 4-5 7-8s1-6 7-9M5 21h3M16 4h3v3" fill="none" />,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  link: (
    <path
      d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"
      fill="none"
    />
  ),
  wing: <path d="M3 18C8 17 12 13 14 6c2 3 2 6 1 8 2-1 4-1 6 0-3 4-8 6-18 4z" />,
  race: <path d="M4 20l4-12 4 6 3-9 5 15M3 20h18" fill="none" />,
  book: (
    <path d="M4 5c3-1.5 5.5-1.5 8 0v15c-2.5-1.5-5-1.5-8 0zM20 5c-3-1.5-5.5-1.5-8 0v15c2.5-1.5 5-1.5 8 0z" />
  ),
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
  title?: string;
}

export function Icon({ name, size = 20, title, style, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      style={{ display: 'inline-block', verticalAlign: '-0.18em', flexShrink: 0, ...style }}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {paths[name]}
    </svg>
  );
}
