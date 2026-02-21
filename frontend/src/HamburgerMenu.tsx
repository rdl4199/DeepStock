import React, { useEffect, useRef, useState } from "react";

type MenuItem = { label: string; href?: string; onClick?: () => void };

export default function HamburgerMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

  // Push app content when sidebar opens
  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    return () => document.body.classList.remove("menu-open");
  }, [open]);

  return (
    <div className="cgSidebarRoot" ref={rootRef}>
      <button
        type="button"
        className="cgSidebarToggle"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="cgSidebarBar" />
        <span className="cgSidebarBar" />
        <span className="cgSidebarBar" />
      </button>

      <aside className={`cgSidebarPanel ${open ? "is-open" : ""}`} aria-hidden={!open}>
        <div className="cgSidebarHeader">Menu</div>

        <nav className="cgSidebarNav">
          {items.map((item) =>
            item.href ? (
              <a
                key={item.label}
                className="cgSidebarItem"
                href={item.href}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                className="cgSidebarItem"
                onClick={() => {
                  item.onClick?.();
                  setOpen(false);
                }}
              >
                {item.label}
              </button>
            )
          )}
        </nav>
      </aside>
    </div>
  );
}
