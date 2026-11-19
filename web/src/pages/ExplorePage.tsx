import { Navigate, useSearchParams } from 'react-router';
import { CATEGORIES, type BoardCategory } from '../api';

/**
 * Legacy `/explore` redirect: discovery has moved to `/`.
 * Preserves `?cat=` → `/c/:category` and `?q=` → `/search?q=` bookmarks.
 */
export function ExplorePage() {
  const [params] = useSearchParams();
  const catParam = params.get('cat');
  const cat = CATEGORIES.find((c): c is { value: BoardCategory; label: string } => c.value !== 'all' && c.value === catParam);
  if (cat) return <Navigate to={`/c/${cat.value}`} replace />;
  const q = params.get('q')?.trim();
  if (q) return <Navigate to={`/search?q=${encodeURIComponent(q)}`} replace />;
  return <Navigate to="/" replace />;
}
