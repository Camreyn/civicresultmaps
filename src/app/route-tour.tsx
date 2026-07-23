"use client";

import { GuidedTour, type TourStep } from "./guided-tour";

export function RouteTour({ steps, tourId }: { steps: TourStep[]; tourId: string }) {
  return <GuidedTour launcher={false} steps={steps} tourId={tourId} />;
}
