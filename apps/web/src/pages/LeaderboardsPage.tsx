import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  DIFFICULTIES,
  DIFFICULTY_IDS,
  STAGES,
  type Difficulty,
  type LeaderboardPageDTO,
  type TeamLeaderboardPageDTO,
} from '@dbfc/shared';
import { DragonAvatar } from '../components/DragonAvatar';
import { Icon } from '../components/Icons';
import {
  EmptyState,
  ErrorBlock,
  Loading,
  Pagination,
  Tabs,
  useDocumentTitle,
} from '../components/ui';
import { useAuth } from '../lib/auth';
import { formatDate, formatDuration, formatNumber, ordinal } from '../lib/format';
import { useApi } from '../lib/useApi';

type Board = 'players' | 'teams';
type Period = 'daily' | 'weekly' | 'all';

export function LeaderboardsPage() {
  useDocumentTitle('Leaderboards');
  const [params, setParams] = useSearchParams();
  const board: Board = params.get('board') === 'teams' ? 'teams' : 'players';
  const period = (
    ['daily', 'weekly', 'all'].includes(params.get('period') ?? '')
      ? params.get('period')
      : 'weekly'
  ) as Period;
  const difficulty = (DIFFICULTY_IDS as readonly string[]).includes(params.get('difficulty') ?? '')
    ? (params.get('difficulty') as Difficulty)
    : 'medium';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const update = (patch: Record<string, string>) =>
    setParams({ board, period, difficulty, page: '1', ...patch });

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Leaderboards</p>
          <h1>Fastest dragons in the forest</h1>
          <p>
            Every score here was replayed and verified by the server. Ties go to the faster catch.
          </p>
        </div>
      </div>
      <Tabs<Board>
        label="Leaderboard type"
        value={board}
        onChange={(b) =>
          update({ board: b, period: b === 'teams' && period === 'daily' ? 'weekly' : period })
        }
        tabs={[
          { id: 'players', label: 'Players' },
          { id: 'teams', label: 'Teams' },
        ]}
      />
      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="row" role="group" aria-label="Period">
          {(board === 'players'
            ? (['daily', 'weekly', 'all'] as Period[])
            : (['weekly', 'all'] as Period[])
          ).map((p) => (
            <button
              key={p}
              type="button"
              className="btn btn--sm"
              aria-pressed={period === p}
              data-active={period === p}
              onClick={() => update({ period: p })}
              style={
                period === p
                  ? { borderColor: 'var(--amber-400)', color: 'var(--amber-300)' }
                  : undefined
              }
            >
              {p === 'daily' ? "Today's Trail" : p === 'weekly' ? 'This week' : 'All-time'}
            </button>
          ))}
        </div>
        {board === 'players' && period !== 'daily' && (
          <label className="row small" style={{ gap: 'var(--space-2)' }}>
            Difficulty
            <select
              className="select"
              style={{ width: 'auto' }}
              value={difficulty}
              onChange={(e) => update({ difficulty: e.target.value })}
            >
              {DIFFICULTY_IDS.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTIES[d].name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {board === 'players' ? (
        <PlayerBoard
          period={period}
          difficulty={difficulty}
          page={page}
          onPage={(p) => update({ page: String(p) })}
        />
      ) : (
        <TeamBoard
          period={period === 'daily' ? 'weekly' : period}
          page={page}
          onPage={(p) => update({ page: String(p) })}
        />
      )}
    </>
  );
}

function PlayerBoard({
  period,
  difficulty,
  page,
  onPage,
}: {
  period: Period;
  difficulty: Difficulty;
  page: number;
  onPage: (p: number) => void;
}) {
  const { status, user } = useAuth();
  const res = useApi<LeaderboardPageDTO>(
    status === 'offline'
      ? null
      : `/api/leaderboards?period=${period}&difficulty=${difficulty}&page=${page}`,
  );
  if (status === 'offline') return <ErrorBlock error={new Error('offline')} />;
  if (res.loading && !res.data) return <Loading />;
  if (res.error || !res.data) return <ErrorBlock error={res.error} onRetry={res.reload} />;
  const data = res.data;
  return (
    <section className="panel" aria-label="Player rankings">
      {data.you && (
        <p className="small" role="status">
          <Icon name="flag" size={14} /> You are <strong>{ordinal(data.you.rank)}</strong> with{' '}
          {formatNumber(data.you.score)} points.
        </p>
      )}
      {user?.isGuest && (
        <p className="small muted">
          Guest runs aren't ranked.{' '}
          <Link to="/auth?mode=upgrade&next=/leaderboards">Create an account</Link> to appear here.
        </p>
      )}
      {data.entries.length === 0 ? (
        <EmptyState icon="trophy" title="No verified catches yet">
          <p>Be the first dragon on this board.</p>
          <Link className="btn btn--primary" to="/play">
            <Icon name="play" size={18} /> Play now
          </Link>
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">
              {period === 'daily'
                ? "Today's Trail"
                : `${DIFFICULTIES[difficulty].name}, ${period === 'weekly' ? 'this week' : 'all-time'}`}
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Dragon</th>
                <th scope="col" className="num">
                  Level
                </th>
                <th scope="col" className="num">
                  Score
                </th>
                <th scope="col" className="num">
                  Time
                </th>
                <th scope="col">Forest</th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.userId} data-you={e.userId === data.you?.userId}>
                  <td>
                    <span className={`rank rank--${e.rank}`}>{e.rank}</span>
                  </td>
                  <td>
                    <span className="row" style={{ gap: 'var(--space-2)', flexWrap: 'nowrap' }}>
                      <DragonAvatar skin={e.avatar} size={30} />
                      <Link to={`/players/${e.userId}`}>{e.displayName}</Link>
                      {e.team && (
                        <span className="badge" title={e.team.name}>
                          {e.team.tag}
                        </span>
                      )}
                      {e.userId === data.you?.userId && (
                        <span className="badge badge--gold">You</span>
                      )}
                    </span>
                  </td>
                  <td className="num">{e.level}</td>
                  <td className="num">{formatNumber(e.score)}</td>
                  <td className="num">{formatDuration(e.ticks / 60)}</td>
                  <td>{STAGES[e.stage].name}</td>
                  <td>{formatDate(e.achievedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={onPage} />
    </section>
  );
}

function TeamBoard({
  period,
  page,
  onPage,
}: {
  period: 'weekly' | 'all';
  page: number;
  onPage: (p: number) => void;
}) {
  const { status, user } = useAuth();
  const res = useApi<TeamLeaderboardPageDTO>(
    status === 'offline' ? null : `/api/leaderboards/teams?period=${period}&page=${page}`,
  );
  const [hint] = useState(
    'Teams earn placement points in live races: 10, 7, 5, 3, 2 and 1 for first to sixth.',
  );
  if (status === 'offline') return <ErrorBlock error={new Error('offline')} />;
  if (res.loading && !res.data) return <Loading />;
  if (res.error || !res.data) return <ErrorBlock error={res.error} onRetry={res.reload} />;
  const data = res.data;
  return (
    <section className="panel" aria-label="Team rankings">
      <p className="small muted">{hint}</p>
      {data.entries.length === 0 ? (
        <EmptyState icon="team" title="No team points yet">
          <p>Race with your team to put it on the board.</p>
          <Link className="btn btn--primary" to="/race">
            <Icon name="race" size={18} /> Start a race
          </Link>
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Team</th>
                <th scope="col" className="num">
                  Members
                </th>
                <th scope="col" className="num">
                  Races
                </th>
                <th scope="col" className="num">
                  Wins
                </th>
                <th scope="col" className="num">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((t) => (
                <tr key={t.teamId} data-you={user?.team?.id === t.teamId}>
                  <td>
                    <span className={`rank rank--${t.rank}`}>{t.rank}</span>
                  </td>
                  <td>
                    <span className="badge badge--gold">{t.tag}</span> {t.name}
                  </td>
                  <td className="num">{t.memberCount}</td>
                  <td className="num">{t.races}</td>
                  <td className="num">{t.wins}</td>
                  <td className="num">{formatNumber(t.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={onPage} />
    </section>
  );
}
