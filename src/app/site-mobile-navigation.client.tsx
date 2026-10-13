"use client";

import { useEffect, useId, useRef } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu } from "lucide-react";
import { activeSitePage, type SiteNavigationLink, type SitePage } from "@/lib/site-navigation";
import styles from "./site-header.module.css";

function NavigationLinks({ links, active, close }: {
  links: readonly SiteNavigationLink[]; active: SitePage | null; close?: () => void;
}) {
  return links.map(({ href, id, label }) => (
    <a href={href} key={id} aria-current={active === id ? "page" : undefined} onClick={close}
      data-tour={id === "equipment" ? "equipment-nav-link" : id === "readiness" ? "readiness-link" : undefined}>
      {label}
    </a>
  ));
}

function NavigationMenu({ links, active, mobile = false }: {
  links: readonly SiteNavigationLink[]; active: SitePage | null; mobile?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const id = useId();
  const groups = [...new Set(links.map((link) => link.group))];
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !ref.current?.open) return;
      ref.current.open = false;
      ref.current.querySelector("summary")?.focus();
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && ref.current?.open && !ref.current.contains(event.target)) ref.current.open = false;
    }
    function resize() {
      // A hidden menu must not remain open or take focus after a breakpoint change.
      if (ref.current && (mobile ? innerWidth > 1100 : innerWidth <= 1100)) ref.current.open = false;
    }
    document.addEventListener("keydown", keydown);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", resize);
    };
  }, [mobile]);
  return (
    <details ref={ref} className={mobile ? styles.mobile : styles.more}>
      <summary role="button" aria-controls={id} aria-label={mobile ? "Primary navigation menu" : "More navigation menu"}
        data-active={!mobile && links.some((link) => link.id === active) ? "true" : undefined}>
        {mobile ? <Menu aria-hidden size={18} /> : null}{mobile ? "Menu" : "More"}<ChevronDown aria-hidden size={14} />
      </summary>
      <nav id={id} aria-label={mobile ? "Mobile primary navigation" : "More navigation"} className={styles.panel}>
        {groups.map((group) => (
          <div key={group} className={styles.group}>
            {group !== "primary" ? <span>{group}</span> : null}
            <NavigationLinks links={links.filter((link) => link.group === group)} active={active}
              close={() => { if (ref.current) ref.current.open = false; }} />
          </div>
        ))}
      </nav>
    </details>
  );
}

export function SiteNavigation({ links }: { links: readonly SiteNavigationLink[] }) {
  const active = activeSitePage(usePathname() ?? "/");
  useEffect(() => {
    const header = document.getElementById("site-toolbar");
    if (!header) return;
    const update = () => document.documentElement.style.setProperty("--site-header-height", `${header.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <nav aria-label="Primary navigation" className={styles.desktop}>
        <NavigationLinks links={links.filter((link) => link.group === "primary")} active={active} />
        <NavigationMenu links={links.filter((link) => link.group !== "primary")} active={active} />
      </nav>
      <NavigationMenu links={links} active={active} mobile />
    </>
  );
}
