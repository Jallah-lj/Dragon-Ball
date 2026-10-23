import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { errorMessage, isNetworkError } from '../lib/api';
import { Icon, type IconName } from './Icons';

export function Loading({ label = 'Loading…', full = false }: { label?: string; full?: boolean }) {
  return (
    <div
      className={`loading-block ${full ? 'loading-block--full' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Alert({
  kind = 'info',
  children,
  title,
}: {
  kind?: 'info' | 'error' | 'success' | 'warn';
  children: ReactNode;
  title?: string;
}) {
  const icon: IconName =
    kind === 'error' ? 'alert' : kind === 'success' ? 'check' : kind === 'warn' ? 'alert' : 'info';
  return (
    <div className={`alert alert--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon name={icon} size={18} />
      <div>
        {title ? <strong style={{ display: 'block' }}>{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = isNetworkError(error);
  return (
    <div className="empty">
      <Icon name={offline ? 'offline' : 'alert'} size={40} />
      <p>
        {offline
          ? 'The Forest Chase server is unreachable right now. Solo play still works offline.'
          : errorMessage(error)}
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        {onRetry ? (
          <button type="button" className="btn btn--ghost" onClick={onRetry}>
            <Icon name="refresh" size={18} /> Try again
          </button>
        ) : null}
        {offline ? (
          <Link className="btn btn--primary" to="/play">
            <Icon name="play" size={18} /> Play offline
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name={icon} size={40} />
      <h3 style={{ fontSize: 'var(--text-lg)' }}>{title}</h3>
      {children}
    </div>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
}

/** Accessible form field: label, input (render prop), hint and error. */
export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy })}
      {hint ? (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field__error" id={`${id}-error`}>
          <Icon name="alert" size={14} /> {error}
        </span>
      ) : null}
    </div>
  );
}

/** Modal dialog with focus trap, Escape to close and focus restore. */
export function Modal({
  title,
  onClose,
  children,
  labelledBy,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute('disabled'));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab') {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    node?.addEventListener('keydown', onKey);
    return () => {
      node?.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      data-game-overlay="modal"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        ref={ref}
      >
        <div className="row row--between" style={{ marginBottom: 'var(--space-3)' }}>
          <h2 id={titleId} style={{ fontSize: 'var(--text-xl)', margin: 0 }}>
            {title}
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--icon btn--sm"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          className="tab"
          aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const next = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
            onChange(tabs[next]!.id);
            refs.current[next]?.focus();
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav
      className="row"
      style={{ justifyContent: 'center', marginTop: 'var(--space-4)' }}
      aria-label="Pagination"
    >
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <Icon name="back" size={16} /> Previous
      </button>
      <span className="muted small" aria-live="polite">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next <Icon name="arrow" size={16} />
      </button>
    </nav>
  );
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · Dragon Ball: Forest Chase` : 'Dragon Ball: Forest Chase';
  }, [title]);
}
