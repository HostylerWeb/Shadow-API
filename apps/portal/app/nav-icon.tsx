export function NavIcon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true as const };
  if (name === "endpoints") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  }
  if (name === "activity" || name === "jobs") {
    return (
      <svg {...common}>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 15l3-4 3 2 4-6" />
      </svg>
    );
  }
  if (name === "keys") {
    return (
      <svg {...common}>
        <circle cx="8" cy="14" r="3" />
        <path d="M11 14h10v3" />
        <path d="M17 14v3" />
      </svg>
    );
  }
  if (name === "docs") {
    return (
      <svg {...common}>
        <path d="M6 4h9l3 3v13H6z" />
        <path d="M15 4v3h3" />
        <path d="M8 11h8" />
        <path d="M8 15h8" />
      </svg>
    );
  }
  if (name === "plan") {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
      </svg>
    );
  }
  if (name === "repairs") {
    return (
      <svg {...common}>
        <path d="M14 7l3 3" />
        <path d="M8 20l9-9-3-3-9 9v3h3z" />
      </svg>
    );
  }
  if (name === "tenants") {
    return (
      <svg {...common}>
        <circle cx="9" cy="9" r="3" />
        <circle cx="16" cy="10" r="2.5" />
        <path d="M4 19c1-3 3-4 5-4s4 1 5 4" />
        <path d="M14 19c.4-1.6 1.4-2.6 3-3" />
      </svg>
    );
  }
  if (name === "connectors") {
    return (
      <svg {...common}>
        <path d="M8 8h8v8H8z" />
        <path d="M12 4v4" />
        <path d="M12 16v4" />
        <path d="M4 12h4" />
        <path d="M16 12h4" />
      </svg>
    );
  }
  if (name === "health") {
    return (
      <svg {...common}>
        <path d="M4 13h4l2-5 4 10 2-5h4" />
      </svg>
    );
  }
  if (name === "out") {
    return (
      <svg {...common}>
        <path d="M9 6H6v12h3" />
        <path d="M10 12h9" />
        <path d="M15 8l4 4-4 4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}
