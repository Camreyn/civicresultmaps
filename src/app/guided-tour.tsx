"use client";

import { ChevronLeft, ChevronRight, HelpCircle, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { tourStartEventName } from "./tour-launch-button";

export type TourTabKey =
  | "map"
  | "review"
  | "history"
  | "electronic"
  | "planner"
  | "data"
  | "methodology"
  | "exports"
  | "imports"
  | "support"
  | "contact";

export type TourStep = {
  body: string;
  chapter?: string;
  fallbackTarget?: string;
  id: string;
  reviewView?: string;
  skipIfMissing?: boolean;
  tab?: TourTabKey;
  target: string;
  title: string;
};

type Rect = { height: number; left: number; top: number; width: number };
type Point = { x: number; y: number };

type GuidedTourProps = {
  activeTab?: TourTabKey;
  launcher?: boolean;
  onSelectTab?: (tab: TourTabKey) => void;
  onStepChange?: (step: TourStep) => void;
  steps: TourStep[];
  tourId?: string;
};

function isTargetUsable(target: Element) {
  const rect = target.getBoundingClientRect();
  const style = window.getComputedStyle(target);
  const isDisabled = target.getAttribute("aria-disabled") === "true"
    || ((target instanceof HTMLButtonElement
      || target instanceof HTMLInputElement
      || target instanceof HTMLSelectElement
      || target instanceof HTMLTextAreaElement) && target.disabled);

  return !isDisabled
    && rect.width > 0
    && rect.height > 0
    && style.display !== "none"
    && style.visibility !== "hidden"
    && Number(style.opacity) !== 0;
}

function findUsableTarget(selector: string) {
  return Array.from(document.querySelectorAll(selector)).find(isTargetUsable) ?? null;
}

function resolveTarget(step: TourStep) {
  return findUsableTarget(step.target) ?? (step.fallbackTarget ? findUsableTarget(step.fallbackTarget) : null);
}

function readRect(target: Element | null): Rect | null {
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  return { height: rect.height, left: rect.left, top: rect.top, width: rect.width };
}

function center(rect: Rect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function distanceSquared(a: Point, b: Point) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function rectAnchorCandidates(rect: Rect): Point[] {
  const middle = center(rect);
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  return [
    { x: middle.x, y: rect.top },
    { x: right, y: rect.top },
    { x: right, y: middle.y },
    { x: right, y: bottom },
    { x: middle.x, y: bottom },
    { x: rect.left, y: bottom },
    { x: rect.left, y: middle.y },
    { x: rect.left, y: rect.top },
  ];
}

function rectAnchorPoint(rect: Rect, toward: Point) {
  return rectAnchorCandidates(rect).reduce((best, candidate) =>
    distanceSquared(candidate, toward) < distanceSquared(best, toward) ? candidate : best,
  );
}

function rectOverlapArea(a: Rect, b: Rect) {
  const horizontal = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const vertical = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return horizontal * vertical;
}

function cardPosition(target: Rect | null, measuredHeight = 280) {
  const margin = 28;
  const fallbackWidth = 380;
  if (typeof window === "undefined") return { left: margin, top: margin, width: fallbackWidth };

  const width = Math.min(fallbackWidth, Math.max(280, window.innerWidth - margin * 2));
  const height = Math.min(measuredHeight, window.innerHeight - margin * 2);
  const right = Math.max(margin, window.innerWidth - width - margin);
  const bottom = Math.max(margin, window.innerHeight - height - margin);
  const positions = [
    { left: margin, top: margin },
    { left: right, top: margin },
    { left: margin, top: bottom },
    { left: right, top: bottom },
  ];
  if (!target) return { ...positions[1], width };

  const paddedTarget = {
    height: target.height + margin * 2,
    left: target.left - margin,
    top: target.top - margin,
    width: target.width + margin * 2,
  };
  const targetMidpoint = center(target);
  const selectedPosition = positions.reduce((best, candidate) => {
    const candidateRect = { ...candidate, height, width };
    const bestRect = { ...best, height, width };
    const candidateOverlap = rectOverlapArea(candidateRect, paddedTarget);
    const bestOverlap = rectOverlapArea(bestRect, paddedTarget);
    if (candidateOverlap !== bestOverlap) return candidateOverlap < bestOverlap ? candidate : best;
    return distanceSquared(center(candidateRect), targetMidpoint) > distanceSquared(center(bestRect), targetMidpoint)
      ? candidate
      : best;
  });
  return { ...selectedPosition, width };
}

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(
    "button:not([disabled]), select:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])",
  )).filter((element) => element.getAttribute("aria-hidden") !== "true");
}

export function GuidedTour({
  activeTab,
  launcher = true,
  onSelectTab,
  onStepChange,
  steps,
  tourId = "workspace",
}: GuidedTourProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [cardRect, setCardRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const activeStep = steps[stepIndex];
  const safeTourId = tourId.replace(/[^a-z0-9_-]/gi, "-");
  const sessionKey = `civicresultmaps:guided-tour:${safeTourId}:v2`;
  const titleId = `${safeTourId}-tour-title`;
  const descriptionId = `${safeTourId}-tour-description`;
  const arrowMarkerId = `${safeTourId}-tour-arrow-head`;
  const selectedPosition = useMemo(() => cardPosition(targetRect, cardRect?.height), [cardRect?.height, targetRect]);

  const startTour = useCallback(() => {
    if (!steps.length) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setStepIndex(0);
    setIsOpen(true);
  }, [steps.length]);

  const closeTour = useCallback(() => {
    try {
      window.sessionStorage.removeItem(sessionKey);
    } catch {
      // Storage availability must never prevent closing the dialog.
    }
    setIsOpen(false);
    window.requestAnimationFrame(() => previousFocusRef.current?.focus());
  }, [sessionKey]);

  useEffect(() => {
    const handleStart = () => startTour();
    window.addEventListener(tourStartEventName(tourId), handleStart);
    return () => window.removeEventListener(tourStartEventName(tourId), handleStart);
  }, [startTour, tourId]);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(sessionKey);
      if (!saved) return;
      window.sessionStorage.removeItem(sessionKey);
      const payload = JSON.parse(saved) as { stepId?: string };
      const restoredIndex = steps.findIndex((step) => step.id === payload.stepId);
      if (restoredIndex >= 0) {
        setStepIndex(restoredIndex);
        setIsOpen(true);
      }
    } catch {
      // Ignore unavailable or malformed session storage.
    }
  }, [sessionKey, steps]);

  useEffect(() => {
    if (stepIndex > steps.length - 1) setStepIndex(Math.max(0, steps.length - 1));
  }, [stepIndex, steps.length]);

  useEffect(() => {
    if (isOpen && activeStep) onStepChange?.(activeStep);
  }, [activeStep, isOpen, onStepChange]);

  useEffect(() => {
    if (!isOpen || !onSelectTab || !activeStep?.tab || activeStep.tab === activeTab) return;
    try {
      window.sessionStorage.setItem(sessionKey, JSON.stringify({ stepId: activeStep.id }));
    } catch {
      // Tab navigation still works when session storage is unavailable.
    }
    onSelectTab(activeStep.tab);
  }, [activeStep, activeTab, isOpen, onSelectTab, sessionKey]);

  useEffect(() => {
    if (!isOpen || !activeStep) return;
    let cancelled = false;
    let timer = 0;
    let retry = 0;

    const update = (target = resolveTarget(activeStep)) => {
      setTargetRect(readRect(target));
      if (cardRef.current) setCardRect(readRect(cardRef.current));
      return Boolean(target);
    };
    const skipStep = () => setStepIndex((current) => {
      if (current >= steps.length - 1) {
        closeTour();
        return current;
      }
      return current + 1;
    });
    const settleTarget = () => {
      if (cancelled) return;
      const target = resolveTarget(activeStep);
      if (target) {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center", inline: "center" });
        timer = window.setTimeout(() => update(target), reducedMotion ? 0 : 260);
        return;
      }
      if (retry < 12) {
        retry += 1;
        timer = window.setTimeout(settleTarget, 90);
        return;
      }
      setTargetRect(null);
      if (activeStep.skipIfMissing) skipStep();
    };
    const updateCurrent = () => update();

    settleTarget();
    window.addEventListener("resize", updateCurrent);
    window.addEventListener("scroll", updateCurrent, true);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("resize", updateCurrent);
      window.removeEventListener("scroll", updateCurrent, true);
    };
  }, [activeStep, closeTour, isOpen, steps.length]);

  useEffect(() => {
    if (!isOpen || !cardRef.current) return;
    setCardRect(readRect(cardRef.current));
  }, [isOpen, selectedPosition.left, selectedPosition.top, stepIndex]);

  useEffect(() => {
    if (!isOpen || !cardRef.current) return;
    cardRef.current.focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTour();
        return;
      }
      if (event.key !== "Tab" || !cardRef.current) return;
      const focusable = focusableElements(cardRef.current);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1) ?? first;
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || activeElement === cardRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeTour, isOpen]);

  const targetAnchor = targetRect && cardRect ? rectAnchorPoint(targetRect, center(cardRect)) : null;
  const cardAnchor = cardRect && targetRect ? rectAnchorPoint(cardRect, center(targetRect)) : null;

  return (
    <>
      {launcher ? (
        <button className="tour-launch" data-tour="tour-launch" onClick={startTour} type="button">
          <HelpCircle aria-hidden size={16} />
          Tour
        </button>
      ) : null}

      {isOpen && activeStep ? (
        <div className="tour-layer" data-tour-id={tourId} data-tour-open="true" role="presentation">
          {targetRect ? (
            <div
              aria-hidden
              className="tour-spotlight"
              style={{
                height: Math.max(44, targetRect.height + 20),
                left: targetRect.left - 10,
                top: targetRect.top - 10,
                width: Math.max(44, targetRect.width + 20),
              }}
            />
          ) : null}

          {targetAnchor && cardAnchor ? (
            <svg aria-hidden className="tour-arrow">
              <defs>
                <marker id={arrowMarkerId} markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                  <path d="M0,0 L8,4 L0,8 Z" />
                </marker>
              </defs>
              <path
                d={`M ${cardAnchor.x.toFixed(1)} ${cardAnchor.y.toFixed(1)} L ${targetAnchor.x.toFixed(1)} ${targetAnchor.y.toFixed(1)}`}
                markerEnd={`url(#${arrowMarkerId})`}
              />
              <circle cx={targetAnchor.x} cy={targetAnchor.y} r="16" />
            </svg>
          ) : null}

          <section
            aria-describedby={descriptionId}
            aria-labelledby={titleId}
            aria-modal="true"
            className="tour-card"
            ref={cardRef}
            role="dialog"
            style={{ left: selectedPosition.left, top: selectedPosition.top, width: selectedPosition.width }}
            tabIndex={-1}
          >
            <div className="tour-card-head">
              <span>{activeStep.chapter ? `${activeStep.chapter} · ` : ""}Step {stepIndex + 1} of {steps.length}</span>
              <button aria-label="Close tutorial" onClick={closeTour} type="button"><X aria-hidden size={15} /></button>
            </div>
            <strong id={titleId}>{activeStep.title}</strong>
            <p id={descriptionId}>{activeStep.body}</p>
            <label className="tour-step-jump">
              <span>Jump to</span>
              <select
                aria-label="Jump to tour step"
                onChange={(event) => {
                  const nextIndex = steps.findIndex((step) => step.id === event.target.value);
                  if (nextIndex >= 0) setStepIndex(nextIndex);
                }}
                value={activeStep.id}
              >
                {steps.map((step, index) => (
                  <option key={step.id} value={step.id}>
                    {index + 1}. {step.chapter ? `${step.chapter}: ` : ""}{step.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="tour-progress" aria-hidden>
              {steps.map((step, index) => <i className={index === stepIndex ? "is-active" : undefined} key={step.id} />)}
            </div>
            <div className="tour-actions">
              <button disabled={stepIndex === 0} onClick={() => setStepIndex((current) => Math.max(0, current - 1))} type="button">
                <ChevronLeft aria-hidden size={15} /> Back
              </button>
              {stepIndex === steps.length - 1 ? (
                <button onClick={closeTour} type="button">Finish</button>
              ) : (
                <button onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))} type="button">
                  Next <ChevronRight aria-hidden size={15} />
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
