import { Link } from 'react-router';
import { Icon } from '../components/Icons';
import { useDocumentTitle } from '../components/ui';

export function NotFoundPage() {
  useDocumentTitle('Lost in the woods');
  return (
    <section className="panel empty" style={{ maxWidth: 560, margin: '0 auto' }}>
      <Icon name="compass" size={48} />
      <h1 style={{ fontSize: 'var(--text-2xl)' }}>Lost in the woods</h1>
      <p>This trail doesn't lead anywhere. The fireball went that way.</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link className="btn btn--primary" to="/play">
          <Icon name="play" size={18} /> Back to the chase
        </Link>
        <Link className="btn btn--ghost" to="/">
          Home
        </Link>
      </div>
    </section>
  );
}
