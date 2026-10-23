import { useParams } from 'react-router';
import { achievementById, DIFFICULTIES, DIFFICULTY_IDS, type PublicProfileDTO } from '@dbfc/shared';
import { DragonAvatar } from '../components/DragonAvatar';
import { Icon } from '../components/Icons';
import { ErrorBlock, Loading, useDocumentTitle } from '../components/ui';
import { formatDate, formatNumber } from '../lib/format';
import { useApi } from '../lib/useApi';

export function PublicProfilePage() {
  const { id } = useParams();
  const res = useApi<PublicProfileDTO>(id ? `/api/users/${encodeURIComponent(id)}` : null);
  useDocumentTitle(res.data?.displayName ?? 'Player');
  if (res.loading && !res.data) return <Loading />;
  if (res.error || !res.data) return <ErrorBlock error={res.error} onRetry={res.reload} />;
  const p = res.data;
  return (
    <div className="stack" style={{ gap: 'var(--space-5)' }}>
      <section className="panel row" style={{ gap: 'var(--space-5)' }}>
        <DragonAvatar skin={p.avatar} size={88} label={`${p.displayName}'s dragon`} />
        <div>
          <p className="eyebrow">Player</p>
          <h1 style={{ marginBottom: 'var(--space-2)' }}>{p.displayName}</h1>
          <div className="row small">
            <span className="badge badge--gold">
              <Icon name="crown" size={14} /> Level {p.level}
            </span>
            {p.team && (
              <span className="badge">
                <Icon name="team" size={14} /> {p.team.tag} · {p.team.name}
              </span>
            )}
            <span className="muted">Joined {formatDate(p.joinedAt)}</span>
          </div>
        </div>
      </section>
      <section className="stats">
        {DIFFICULTY_IDS.map((d) => (
          <div className="stat" key={d}>
            <div className="stat__label">Best · {DIFFICULTIES[d].name}</div>
            <div className="stat__value">{formatNumber(p.bestScores[d])}</div>
          </div>
        ))}
        <div className="stat">
          <div className="stat__label">Catches</div>
          <div className="stat__value">{p.catches}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Races · wins</div>
          <div className="stat__value">
            {p.races} · {p.raceWins}
          </div>
        </div>
      </section>
      <section className="panel">
        <h2 className="panel__title">
          <Icon name="trophy" /> Achievements
        </h2>
        {p.achievements.length === 0 ? (
          <p className="muted">No achievements yet.</p>
        ) : (
          <div className="grid grid--3">
            {p.achievements.map((a) => (
              <div className="achievement" data-unlocked="true" key={a.id}>
                <span className="achievement__icon">
                  <Icon name="trophy" size={20} />
                </span>
                <span>
                  <strong>{achievementById(a.id)?.name ?? a.id}</strong>
                  <span className="small muted" style={{ display: 'block' }}>
                    {formatDate(a.unlockedAt)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
