import { skinById } from '@dbfc/shared';

interface Props {
  skin: string;
  size?: number;
  label?: string;
}

/** Profile portrait of the player's dragon, drawn from its skin palette. */
export function DragonAvatar({ skin, size = 40, label }: Props) {
  const p = skinById(skin).palette;
  return (
    <span className="avatar" style={{ width: size, height: size, display: 'inline-block' }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      >
        <rect width="64" height="64" fill="#1d2a1f" />
        <path d="M0 52c10-6 20-4 30 0s22 6 34-2v14H0z" fill="#283c29" />
        <path
          d="M14 22c-4-6-9-9-13-10 5 4 7 8 8 13zM24 18c-1-7-4-12-8-15 2 6 2 11 1 16z"
          fill={p.horn}
          stroke="#1b0f0a"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path
          d="M8 44c-1-9 2-17 9-22 7-5 17-5 25-2 7 2.5 13 6 17 10 2 2 2 5-1 6l-17 4c-6 1-10 4-12 9-5 1-14 1-21-5z"
          fill={p.body}
          stroke="#1b0f0a"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M30 44c8-2 16-3 24-6l4 0c-6 3-15 6-24 8z" fill={p.belly} />
        <path d="M26 27c4-3 9-3 13 0-4 0-8 1-12 3z" fill={p.bodyShade} />
        <ellipse cx="33" cy="31" rx="4" ry="3" fill={p.eye} stroke="#1b0f0a" strokeWidth="1" />
        <ellipse cx="34" cy="31" rx="1.2" ry="2.4" fill="#1a0d06" />
        <circle cx="53" cy="34" r="1.2" fill="#1b0f0a" />
        <path
          d="M10 32l-6 3 6 2-5 4 7-1"
          fill={p.spines}
          stroke="#1b0f0a"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
