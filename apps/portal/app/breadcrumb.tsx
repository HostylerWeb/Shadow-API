import Link from "next/link";

export function Breadcrumb({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <p className="breadcrumb">
      {items.map((item, index) => (
        <span key={item.label}>
          {index > 0 ? " › " : null}
          {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
        </span>
      ))}
    </p>
  );
}
