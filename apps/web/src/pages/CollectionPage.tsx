import { useState } from 'react';
import { ACHIEVEMENTS, SKINS, type CollectionDTO } from '@dbfc/shared';
import { DragonAvatar } from '../components/DragonAvatar';
import { Icon, type IconName } from '../components/Icons';
import { RequireSession } from '../components/RequireSession';
import { Alert, ErrorBlock, Loading, Modal, useDocumentTitle } from '../components/ui';
import { useToast } from '../components/Toast';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatNumber } from '../lib/format';
import { useApi } from '../lib/useApi';

const ICONS: Record<string, IconName> = {
  flame: 'flame',
  shield: 'shield',
  scale: 'scale',
  crystal: 'crystal',
  crown: 'crown',
  leaf: 'leaf',
  trophy: 'trophy',
  team: 'team',
  bolt: 'bolt',
  compass: 'compass',
  thorn: 'thorn',
};

export function CollectionPage() {
  useDocumentTitle('Collection');
  return <RequireSession feature="Your collection">{() => <CollectionContent />}</RequireSession>;
}

function CollectionContent() {
  const res = useApi<CollectionDTO>('/api/collection');
  const { refresh } = useAuth();
  const toast = useToast();
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (res.loading && !res.data) return <Loading />;
  if (res.error || !res.data) return <ErrorBlock error={res.error} onRetry={res.reload} />;
  const c = res.data;
  const act = async (path: string, message: string, body: object = {}) => {
    setError(null);
    try {
      res.setData(await api<CollectionDTO>(path, { method: 'POST', body }));
      toast(message, 'check');
      void refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const unlockedCount = c.achievements.filter((a) => a.unlocked).length;
  const buyingSkin = SKINS.find((s) => s.id === buying);
  return (
    <div className="stack" style={{ gap: 'var(--space-5)' }}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Collection</p>
          <h1>Your hoard</h1>
          <p>
            Spend forest crystals on new scales, or earn rare skins through achievements. Skins are
            purely cosmetic.
          </p>
        </div>
        <span
          className="badge badge--moss"
          style={{ fontSize: 'var(--text-md)', padding: '6px 14px' }}
        >
          <Icon name="crystal" size={18} /> {formatNumber(c.crystals)} crystals
        </span>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <section aria-labelledby="skins">
        <h2 id="skins" style={{ fontSize: 'var(--text-xl)' }}>
          Dragon skins
        </h2>
        <div className="grid grid--3">
          {c.skins.map((s) => {
            const def = SKINS.find((x) => x.id === s.id)!;
            return (
              <article className="panel panel--flat skin-card" key={s.id} aria-label={def.name}>
                <div className="row" style={{ gap: 'var(--space-3)' }}>
                  <DragonAvatar skin={s.id} size={64} />
                  <div>
                    <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 4 }}>{def.name}</h3>
                    <div className="skin-card__swatches" aria-hidden="true">
                      {[
                        def.palette.body,
                        def.palette.belly,
                        def.palette.wing,
                        def.palette.spines,
                      ].map((col) => (
                        <span key={col} style={{ background: col }} />
                      ))}
                    </div>
                  </div>
                </div>
                <p className="small muted" style={{ margin: 0 }}>
                  {def.description}
                </p>
                {s.equipped ? (
                  <span className="badge badge--gold">
                    <Icon name="check" size={12} /> Equipped
                  </span>
                ) : s.owned ? (
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() =>
                      void act(`/api/collection/skins/${s.id}/equip`, `${def.name} equipped.`, {})
                    }
                  >
                    Equip
                  </button>
                ) : s.price !== null ? (
                  <button
                    type="button"
                    className="btn btn--sm btn--gold"
                    onClick={() => setBuying(s.id)}
                    disabled={c.crystals < s.price}
                    aria-describedby={`price-${s.id}`}
                  >
                    <Icon name="crystal" size={14} /> Buy for {s.price}
                  </button>
                ) : (
                  <span className="badge badge--lock">
                    <Icon name="lock" size={12} /> {s.requirement}
                  </span>
                )}
                {!s.owned && s.price !== null && c.crystals < s.price && (
                  <span id={`price-${s.id}`} className="small muted">
                    {s.price - c.crystals} more crystals needed
                  </span>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <section aria-labelledby="achievements">
        <h2 id="achievements" style={{ fontSize: 'var(--text-xl)' }}>
          Achievements{' '}
          <span className="muted small">
            ({unlockedCount} of {ACHIEVEMENTS.length})
          </span>
        </h2>
        <div className="grid grid--3">
          {ACHIEVEMENTS.map((a) => {
            const state = c.achievements.find((x) => x.id === a.id);
            return (
              <div
                className="achievement"
                data-unlocked={state?.unlocked ? 'true' : 'false'}
                key={a.id}
              >
                <span className="achievement__icon">
                  <Icon name={state?.unlocked ? (ICONS[a.icon] ?? 'trophy') : 'lock'} size={20} />
                </span>
                <span>
                  <strong>{a.name}</strong>
                  <span className="small muted" style={{ display: 'block' }}>
                    {a.description}
                  </span>
                  <span
                    className="small"
                    style={{
                      display: 'block',
                      color: state?.unlocked ? 'var(--amber-300)' : 'var(--parchment-400)',
                    }}
                  >
                    {state?.unlocked && state.unlockedAt
                      ? `Unlocked ${formatDate(state.unlockedAt)}`
                      : 'Locked'}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>
      {buyingSkin && buyingSkin.unlock.type === 'purchase' && (
        <Modal title={`Buy ${buyingSkin.name}?`} onClose={() => setBuying(null)}>
          <div className="row" style={{ gap: 'var(--space-4)' }}>
            <DragonAvatar skin={buyingSkin.id} size={72} />
            <p>
              Spend <strong>{buyingSkin.unlock.price}</strong> of your {formatNumber(c.crystals)}{' '}
              crystals on {buyingSkin.name}?
            </p>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn btn--gold"
              onClick={async () => {
                const id = buyingSkin.id;
                setBuying(null);
                await act(
                  `/api/collection/skins/${id}/purchase`,
                  `${buyingSkin.name} added to your hoard!`,
                );
              }}
            >
              Buy
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setBuying(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
