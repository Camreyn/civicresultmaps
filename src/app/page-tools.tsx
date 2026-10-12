import { TourLaunchButton } from "./tour-launch-button";

/** Page-specific utilities stay below the shared public toolbar. */
export function PageTools({ tourId }: { tourId: string }) {
  return <div className="site-page-tools" role="group" aria-label="Page tools"><TourLaunchButton tourId={tourId} /></div>;
}
