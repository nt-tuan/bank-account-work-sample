import { twMerge } from './classes.ts';
import { PageLink } from '@/shared/navigation/PageLink.tsx';
const cell = 'inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-md';

export function Pagination({
  page,
  pageSize,
  total,
  getPageHref,
}: {
  page: number;
  pageSize: number;
  total: number;
  getPageHref: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const window = [page - 2, page - 1, page, page + 1, page + 2].filter((p) => p >= 1 && p <= pages);
  const link = (p: number, label: string, aria?: string) => (
    <PageLink className={cell} to={getPageHref(p)} aria-label={aria}>
      {label}
    </PageLink>
  );
  return (
    <nav className="flex items-center justify-center gap-1 p-4" aria-label="Pagination">
      {page > 1 ? (
        link(page - 1, '‹', 'Previous page')
      ) : (
        <span aria-hidden="true" className={twMerge(cell, 'text-muted')}>
          ‹
        </span>
      )}
      {window.map((p) =>
        p === page ? (
          <span key={p} aria-current="page" className={twMerge(cell, 'bg-chrome text-white')}>
            {p}
          </span>
        ) : (
          <span key={p} className={cell}>
            {link(p, String(p), `Page ${p}`)}
          </span>
        ),
      )}
      {page < pages ? (
        link(page + 1, '›', 'Next page')
      ) : (
        <span aria-hidden="true" className={twMerge(cell, 'text-muted')}>
          ›
        </span>
      )}
      <span className={twMerge(cell, 'ml-2 text-muted')}>
        Page {page} of {pages}
      </span>
    </nav>
  );
}
