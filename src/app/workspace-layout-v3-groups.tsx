import type { CSSProperties } from "react";
import type { WorkspaceRuntimeGroupV3 } from "@/lib/workspace-layout-v3-runtime";
import { WorkspaceLayoutBlockV2 } from "./workspace-layout-v2-blocks";

export function WorkspaceLayoutGroupsV3({ groups }: { groups: WorkspaceRuntimeGroupV3[] }) {
  return (
    <div aria-label="Custom workspace groups" className="workspace-layout-groups">
      {groups.map((group) => (
        <section
          aria-label={group.heading || group.name}
          className="workspace-layout-group"
          data-heading-align={group.presentation.headingAlign}
          data-show-divider={group.presentation.showDivider ? "true" : "false"}
          data-spacing={group.presentation.spacing}
          data-surface={group.presentation.surface}
          key={group.id}
        >
          {(group.heading || group.description) && (
            <header className="workspace-layout-group-heading">
              {group.heading && <h2>{group.heading}</h2>}
              {group.description && <p>{group.description}</p>}
            </header>
          )}
          {group.rows.map((row) => (
            <div
              className="workspace-custom-row"
              data-align={row.align}
              data-gap={row.gap}
              key={row.id}
            >
              {row.columns.map((column) => (
                <div
                  className="workspace-custom-column"
                  key={column.id}
                  style={{
                    "--layout-span-desktop": column.span.desktop,
                    "--layout-span-mobile": column.span.mobile,
                    "--layout-span-tablet": column.span.tablet,
                  } as CSSProperties}
                >
                  {column.items.map((block, index) => (
                    <WorkspaceLayoutBlockV2
                      item={{
                        ...block,
                        columnId: column.id,
                        order: index,
                        rowId: row.id,
                        span: column.span,
                      }}
                      key={block.id}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
