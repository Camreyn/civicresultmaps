"use client";

import { CircleHelp } from "lucide-react";

export const tourStartEventName = (tourId: string) => `civicresultmaps:start-tour:${tourId}`;

export function TourLaunchButton({ tourId }: { tourId: string }) {
  return (
    <button
      aria-label="Start a guided tour of this page"
      className="site-tour-launch"
      data-tour="tour-launch"
      onClick={() => window.dispatchEvent(new CustomEvent(tourStartEventName(tourId)))}
      type="button"
    >
      <CircleHelp aria-hidden size={15} />
      Tour
    </button>
  );
}
