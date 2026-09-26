import Link from "next/link";

export function Pager({
  page,
  total,
  pageSize,
  href,
}: {
  page: number;
  total: number;
  pageSize: number;
  href: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(page, 1), pages);
  return (
    <nav className="pager">
      <Link href={href(Math.max(1, current - 1))} aria-disabled={current <= 1}>
        ← Previous
      </Link>
      <span>
        Page {current} of {pages} · {total} rows
      </span>
      <Link href={href(Math.min(pages, current + 1))}>Next →</Link>
    </nav>
  );
}
