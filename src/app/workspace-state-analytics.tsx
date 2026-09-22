"use client";

import { inject, track } from "@vercel/analytics";
import { useEffect, useRef } from "react";
import { stateLoadedEventName, stateLoadProperties, type StateLoadSelection } from "@/lib/workspace-analytics";

export function WorkspaceStateAnalytics({ state, year, selection }: {
  state: string;
  year: number;
  selection: StateLoadSelection;
}) {
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    const properties = stateLoadProperties(state, year, selection);
    if (!properties) return;

    const key = `${state}:${year}:${selection}`;
    if (lastTracked.current === key) return;
    lastTracked.current = key;

    try {
      // This effect can precede the root <Analytics> effect. Initialize its queue
      // with the same Next.js configuration, leaving pageviews to that component.
      if (!window.va) {
        inject({
          framework: "next",
          disableAutoTrack: true,
          basePath: process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH,
        }, process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG);
      }
      track(stateLoadedEventName, properties);
    } catch {
      // Analytics is best-effort and must never prevent access to public data.
    }
  }, [state, year, selection]);

  return null;
}
