"use client";

import { useState, useEffect } from "react";

const navLinks = [
  { href: "#story", label: "Our Story" },
  { href: "#treatments", label: "Treatments" },
  { href: "#therapists", label: "Therapists" },
  { href: "#book", label: "Book Appointment" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);

  // Close on escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <button
        className="mobile-menu-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        <span className={`hamburger${open ? " open" : ""}`}>
          <span /><span /><span />
        </span>
      </button>

      {open && (
        <div className="mobile-nav-overlay" onClick={() => setOpen(false)}>
          <nav className="mobile-nav-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-nav-header">
              <button className="mobile-close-btn" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="mobile-nav-link"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <a href="#book" className="mobile-nav-cta" onClick={() => setOpen(false)}>
              Reserve a session →
            </a>
          </nav>
        </div>
      )}
    </>
  );
}
