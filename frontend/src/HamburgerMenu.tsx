import React, { useEffect, useRef, useState } from "react";

type MenuItem = { label: string; href?: string; onClick?: () => void };

export default function HamburgerMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    document.addEventListener("keydown", onKeyDown);
    drawerRef.current?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="hamburgerBtn"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="bar" />
        <span className="bar" />
        <span className="bar" />
      </button>

      {open && (
        <>
          <div className="drawerOverlay" onClick={() => setOpen(false)} />
          <aside
            className="leftDrawer leftDrawerOpen"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            ref={drawerRef}
          >
            <div className="drawerHeader">
              <div className="drawerTitle">Menu</div>
              <button
                type="button"
                className="drawerClose"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <nav className="drawerNav">
              {items.map((item) =>
                item.href ? (
                  <a
                    key={item.label}
                    className="drawerLink"
                    href={item.href}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </a>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    className="drawerLink"
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
        </>
      )}
    </>
  );
}
