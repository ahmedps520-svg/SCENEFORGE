import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="eyebrow mb-3">Scene missing</div>
      <h1 className="display text-[40px] text-ink">Nothing on this reel</h1>
      <p className="mt-2 max-w-sm text-[13.5px] text-muted">The page you were looking for doesn’t exist, or the project it belonged to was deleted.</p>
      <Link to="/" className="btn btn-primary mt-6">
        Back to the studio
      </Link>
    </div>
  );
}
