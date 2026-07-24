"use client";

import { CircleHelp } from "lucide-react";

export const tourStartEventName = (tourId: string) => `civicresultmaps:start-tour:${tourId}`;

const pendingTourStarts = new Set<string>();

export function requestTourStart(tourId: string) {
  pendingTourStarts.add(tourId);
  window.dispatchEvent(new CustomEvent(tourStartEventName(tourId)));
}

export function consumePendingTourStart(tourId: string) {
  return pendingTourStarts.delete(tourId);
}

export function TourLaunchButton({ tourId }: { tourId: string }) {
  return (
    <button
      aria-label="Start a guided tour of this page"
      className="site-tour-launch"
      data-tour="tour-launch"
      onClick={() => requestTourStart(tourId)}
      type="button"
    >
      <CircleHelp aria-hidden size={15} />
      Tour
    </button>
  );
}
