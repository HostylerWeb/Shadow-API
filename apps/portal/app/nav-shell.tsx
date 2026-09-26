"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const NavCollapse = createContext<{ collapsed: boolean; toggle: () => void }>({
  collapsed: false,
  toggle: () => {},
});

export function NavShell({ admin, children }: { admin?: boolean; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(window.localStorage.getItem("shadowapi-nav") === "collapsed");
  }, []);
  function toggle() {
    setCollapsed((open) => {
      const next = !open;
      window.localStorage.setItem("shadowapi-nav", next ? "collapsed" : "open");
      return next;
    });
  }
  return (
    <NavCollapse.Provider value={{ collapsed, toggle }}>
      <div className={`${admin ? "shell admin-shell" : "shell"}${collapsed ? " nav-collapsed" : ""}`}>{children}</div>
    </NavCollapse.Provider>
  );
}

export function NavToggle() {
  const { collapsed, toggle } = useContext(NavCollapse);
  return (
    <button type="button" className="nav-toggle" onClick={toggle} aria-label={collapsed ? "Expand menu" : "Collapse menu"} title={collapsed ? "Expand menu" : "Collapse menu"}>
      {collapsed ? "»" : "«"}
    </button>
  );
}
