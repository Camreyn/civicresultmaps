import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import {
  workspaceViewportVisibilityAttributes,
  type WorkspaceCustomNodeV2,
  type WorkspaceRichTextBlockV1,
  type WorkspaceRichTextInlineV1,
} from "@/lib/workspace-layout-v2";
import type { WorkspaceRuntimeCustomNode } from "@/lib/workspace-layout-v2-runtime";
import { contextualizeWorkspaceHref, type WorkspaceNavigationContext } from "@/lib/workspace-navigation";

type WorkspaceLayoutBlockV2Props = {
  item: WorkspaceRuntimeCustomNode;
  navigationContext?: WorkspaceNavigationContext;
};

export function WorkspaceLayoutBlockV2({ item, navigationContext }: WorkspaceLayoutBlockV2Props) {
  const attributes = workspaceLayoutItemAttributesV2(item);
  const label = item.title || blockLabel(item);

  if (item.component === "divider") {
    return (
      <div aria-label={label} className="workspace-custom-block workspace-custom-divider" {...attributes} role="separator">
        {item.title && <span>{item.title}</span>}
      </div>
    );
  }

  if (item.component === "heading") {
    return (
      <header aria-label={label} className="workspace-custom-block workspace-custom-heading" {...attributes}>
        <h2>{item.title || "Section heading"}</h2>
        {item.body && <p>{item.body}</p>}
      </header>
    );
  }

  if (item.component === "metric-strip") {
    return (
      <section aria-label={label} className="workspace-custom-block workspace-custom-metrics" {...attributes}>
        {item.title && <h2>{item.title}</h2>}
        <div>
          {item.items?.map((metric, index) => (
            <article key={`${metric.label}-${index}`}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              {metric.body && <small>{metric.body}</small>}
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (item.component === "link-list" || item.component === "button-group") {
    return (
      <nav aria-label={label} className={`workspace-custom-block workspace-custom-${item.component}`} {...attributes}>
        {item.title && <h2>{item.title}</h2>}
        {item.body && <p>{item.body}</p>}
        <ul>
          {item.items?.map((link, index) => (
            <li key={`${link.label}-${index}`}>
              <a href={workspaceBlockHref(link.href, navigationContext)}>{link.label}</a>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  if (item.component === "image" && item.asset) {
    return (
      <figure aria-label={label} className="workspace-custom-block workspace-custom-image" {...attributes}>
        <Image
          alt={item.asset.decorative ? "" : item.asset.alt}
          height={item.asset.height}
          sizes="(max-width: 760px) 100vw, (max-width: 1100px) 75vw, 1200px"
          src={item.asset.url}
          width={item.asset.width}
        />
        {(item.asset.caption || item.title) && <figcaption>{item.asset.caption || item.title}</figcaption>}
      </figure>
    );
  }

  if (item.component === "video" && item.video) {
    const src = item.video.provider === "youtube"
      ? `https://www.youtube-nocookie.com/embed/${item.video.id}`
      : `https://player.vimeo.com/video/${item.video.id}`;
    return (
      <section aria-label={label} className="workspace-custom-block workspace-custom-video" {...attributes}>
        {item.title && <h2>{item.title}</h2>}
        <div className="workspace-video-frame">
          <iframe
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            src={src}
            title={item.video.title}
          />
        </div>
      </section>
    );
  }

  if (item.component === "accordion") {
    return (
      <section aria-label={label} className="workspace-custom-block workspace-custom-accordion" {...attributes}>
        {item.title && <h2>{item.title}</h2>}
        {item.items?.map((entry, index) => (
          <details key={`${entry.label}-${index}`}>
            <summary>{entry.label}</summary>
            <p>{entry.body || entry.value}</p>
          </details>
        ))}
      </section>
    );
  }

  return (
    <section
      aria-label={label}
      className={[
        "workspace-custom-block",
        item.component === "callout" ? "workspace-custom-callout" : "workspace-custom-narrative",
      ].join(" ")}
      {...attributes}
    >
      {item.title && <h2>{item.title}</h2>}
      {item.document ? <WorkspaceRichText blocks={item.document.blocks} navigationContext={navigationContext} /> : item.body && <p>{item.body}</p>}
    </section>
  );
}

function WorkspaceRichText({ blocks, navigationContext }: {
  blocks: WorkspaceRichTextBlockV1[];
  navigationContext?: WorkspaceNavigationContext;
}) {
  const content: ReactNode[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.type !== "list-item") {
      content.push(renderRichBlock(block, index, navigationContext));
      continue;
    }
    const ordered = Boolean(block.ordered);
    const items: WorkspaceRichTextBlockV1[] = [block];
    while (blocks[index + 1]?.type === "list-item" && Boolean(blocks[index + 1].ordered) === ordered) {
      items.push(blocks[index + 1]);
      index += 1;
    }
    const children = items.map((item, itemIndex) => (
      <li key={itemIndex}>{item.children.map((child, childIndex) => renderInline(child, childIndex, navigationContext))}</li>
    ));
    content.push(ordered ? <ol key={`list-${index}`}>{children}</ol> : <ul key={`list-${index}`}>{children}</ul>);
  }
  return <div className="workspace-rich-text">{content}</div>;
}

function renderRichBlock(
  block: WorkspaceRichTextBlockV1,
  index: number,
  navigationContext?: WorkspaceNavigationContext,
) {
  const children = block.children.map((child, childIndex) => renderInline(child, childIndex, navigationContext));
  if (block.type === "heading") {
    return block.level === 3 ? <h3 key={index}>{children}</h3> : <h2 key={index}>{children}</h2>;
  }
  return <p key={index}>{children}</p>;
}

function renderInline(item: WorkspaceRichTextInlineV1, index: number, navigationContext?: WorkspaceNavigationContext) {
  let child: ReactNode = item.text;
  if (item.marks?.includes("code")) child = <code>{child}</code>;
  if (item.marks?.includes("bold")) child = <strong>{child}</strong>;
  if (item.marks?.includes("italic")) child = <em>{child}</em>;
  if (item.href) child = <a href={workspaceBlockHref(item.href, navigationContext)}>{child}</a>;
  return <span key={index}>{child}</span>;
}

function workspaceBlockHref(href: string | undefined, navigationContext?: WorkspaceNavigationContext) {
  if (!href) return undefined;
  return navigationContext ? contextualizeWorkspaceHref(href, navigationContext) : href;
}

function workspaceLayoutItemAttributesV2(item: WorkspaceRuntimeCustomNode) {
  return {
    ...workspaceViewportVisibilityAttributes(item.visibility),
    "data-layout-custom": item.id,
    "data-layout-density": item.presentation?.density ?? "comfortable",
    "data-layout-emphasis": item.presentation?.emphasis ?? "standard",
    "data-layout-surface": item.presentation?.surface ?? "panel",
    style: {
      "--layout-span-desktop": item.span.desktop,
      "--layout-span-mobile": item.span.mobile,
      "--layout-span-tablet": item.span.tablet,
      order: item.order,
    } as CSSProperties,
  };
}

function blockLabel(item: WorkspaceCustomNodeV2) {
  return item.component.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}
