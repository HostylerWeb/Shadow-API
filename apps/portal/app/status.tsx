export function Status({ value }: { value: string }) {
  const label = value.charAt(0).toUpperCase() + value.slice(1);
  return <span className={`status status-${value}`}>{label}</span>;
}
