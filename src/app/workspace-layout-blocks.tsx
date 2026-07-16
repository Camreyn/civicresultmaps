import type { CSSProperties } from "react";
import {
  isWorkspaceCustomBlock,
  workspaceComponentLabel,
  type WorkspaceCustomBlockV1,
  type WorkspaceLayoutItemV1,
} from "@/lib/workspace-layout";

type WorkspaceLayoutBlockProps = {
  item: WorkspaceCustomBlockV1;
  order: number;
};

export function workspaceLayoutItemStyle(item: WorkspaceLayoutItemV1, order: number): CSSProperties {
  const span = item.presentation?.span;
  return {
    "--layout-span-desktop": span?.desktop ?? 12,
    "--layout-span-mobile": span?.mobile ?? 12,
    "--layout-span-tablet": span?.tablet ?? 12,
    order,
  } as CSSProperties;
}

export function workspaceLayoutItemAttributes(item: WorkspaceLayoutItemV1, order: number) {
  return {
    "data-layout-density": item.presentation?.density ?? "comfortable",
    "data-layout-emphasis": item.presentation?.emphasis ?? "standard",
    "data-layout-map-height": item.presentation?.mapHeight,
    "data-layout-surface": item.presentation?.surface ?? "panel",
    hidden: !item.visible,
    style: workspaceLayoutItemStyle(item, order),
  };
}

export function WorkspaceLayoutBlock({ item, order }: WorkspaceLayoutBlockProps) {
  const attributes = workspaceLayoutItemAttributes(item, order);
  const label = item.title || workspaceComponentLabel(item.component);

  if (item.component === "divider") {
    return (
      <div
        aria-label={label}
        className="workspace-custom-block workspace-custom-divider"
        data-layout-custom={item.id}
        {...attributes}
        role="separator"
      >
        <span>{label}</span>
      </div>
    );
  }

  if (item.component === "metric-strip") {
    return (
      <section
        aria-label={label}
        className="workspace-custom-block workspace-custom-metrics"
        data-layout-custom={item.id}
        {...attributes}
      >
        {item.title && <h2>{item.title}</h2>}
        <div>
          {item.items?.map((metric, index) => (
            <article key={`${metric.label}-${index}`}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (item.component === "link-list") {
    return (
      <nav
        aria-label={label}
        className="workspace-custom-block workspace-custom-links"
        data-layout-custom={item.id}
        {...attributes}
      >
        {item.title && <h2>{item.title}</h2>}
        <ul>
          {item.items?.map((link, index) => (
            <li key={`${link.label}-${index}`}>
              <a href={link.href}>{link.label}</a>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <section
      aria-label={label}
      className={[
        "workspace-custom-block",
        item.component === "callout" ? "workspace-custom-callout" : "workspace-custom-narrative",
      ].join(" ")}
      data-layout-custom={item.id}
      {...attributes}
    >
      {item.title && <h2>{item.title}</h2>}
      {item.body && <p>{item.body}</p>}
    </section>
  );
}

export function WorkspaceLayoutBlocks({
  items,
}: {
  items: readonly (WorkspaceLayoutItemV1 & { order?: number })[];
}) {
  return items.map((item, index) => isWorkspaceCustomBlock(item)
    ? <WorkspaceLayoutBlock item={item} key={item.id} order={item.order ?? index} />
    : null);
}
