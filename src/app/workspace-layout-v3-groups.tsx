import type { CSSProperties, ReactNode } from "react";
import type { WorkspaceProductionNodeV3 } from "@/lib/workspace-layout-v3";
import type { WorkspaceRuntimeGroupV3 } from "@/lib/workspace-layout-v3-runtime";
import { WorkspaceLayoutBlockV2 } from "./workspace-layout-v2-blocks";

type WorkspaceLayoutGroupsV3Props = {
  groups: WorkspaceRuntimeGroupV3[];
  renderProduction: (node: WorkspaceProductionNodeV3) => ReactNode | null;
};

export function WorkspaceLayoutGroupsV3({ groups, renderProduction }: WorkspaceLayoutGroupsV3Props) {
  const landmarks = groups.filter((group) => Boolean(group.heading));

  return (
    <div aria-label="Configured workspace layout" className="workspace-layout-groups">
      {landmarks.length > 1 && (
        <nav aria-label="On this page" className="workspace-layout-local-nav">
          <span>On this page</span>
          <ul>
            {landmarks.map((group) => (
              <li key={group.id}>
                <a href={`#workspace-group-${group.id}`}>{group.heading}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {groups.map((group) => (
        <section
          aria-label={group.heading || group.name}
          className="workspace-layout-group"
          data-heading-align={group.presentation.headingAlign}
          data-show-divider={group.presentation.showDivider ? "true" : "false"}
          data-spacing={group.presentation.spacing}
          data-surface={group.presentation.surface}
          id={`workspace-group-${group.id}`}
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
                  {column.items.map((node, index) => (
                    <div
                      className="workspace-layout-node"
                      data-layout-component={node.component}
                      data-layout-density={node.presentation?.density ?? "comfortable"}
                      data-layout-emphasis={node.presentation?.emphasis ?? "standard"}
                      data-layout-height={node.presentation?.height ?? "auto"}
                      data-layout-node-kind={node.kind}
                      data-layout-surface={node.presentation?.surface ?? "panel"}
                      key={node.id}
                    >
                      {node.kind === "production"
                        ? renderProduction(node)
                        : (
                            <WorkspaceLayoutBlockV2
                              item={{
                                ...node,
                                columnId: column.id,
                                order: index,
                                rowId: row.id,
                                span: column.span,
                              }}
                            />
                          )}
                    </div>
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
