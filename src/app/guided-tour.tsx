"use client";

import { ChevronLeft, ChevronRight, HelpCircle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  fallbackTarget?: string;
  id: string;
  skipIfMissing?: boolean;
  tab?: TourTabKey;
  target: string;
  title: string;
};

type Rect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type GuidedTourProps = {
  activeTab: TourTabKey;
  onSelectTab: (tab: TourTabKey) => void;
  steps: TourStep[];
};

function isTargetUsable(target: Element) {
  const rect = target.getBoundingClientRect();
  const style = window.getComputedStyle(target);
  const isDisabled =
    target.getAttribute("aria-disabled") === "true" ||
    ((target instanceof HTMLButtonElement ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement) &&
      target.disabled);

  return (
    !isDisabled &&
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) !== 0
  );
}

function findUsableTarget(selector: string) {
  return Array.from(document.querySelectorAll(selector)).find(isTargetUsable) ?? null;
}

function resolveTarget(step: TourStep) {
  return findUsableTarget(step.target) ?? (step.fallbackTarget ? findUsableTarget(step.fallbackTarget) : null);
}

function readRect(target: Element | null): Rect | null {
  if (!target) {
    return null;
  }

  const rect = target.getBoundingClientRect();
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

type Point = {
  x: number;
  y: number;
};

function rectAnchorCandidates(rect: Rect) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;

  return [
    { x: centerX, y: rect.top },
    { x: right, y: rect.top },
    { x: right, y: centerY },
    { x: right, y: bottom },
    { x: centerX, y: bottom },
    { x: rect.left, y: bottom },
    { x: rect.left, y: centerY },
    { x: rect.left, y: rect.top },
  ];
}

function distanceSquared(a: Point, b: Point) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function rectCenter(rect: Rect): Point {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function rectAnchorPoint(rect: Rect, toward: Point) {
  return rectAnchorCandidates(rect).reduce((best, candidate) =>
    distanceSquared(candidate, toward) < distanceSquared(best, toward) ? candidate : best,
  );
}

function rectOverlapArea(a: Rect, b: Rect) {
  const xOverlap = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const yOverlap = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));

  return xOverlap * yOverlap;
}

function cardPosition(target: Rect | null, cardHeight = 260) {
  const margin = 28;
  const fallbackWidth = 380;
  if (typeof window === "undefined") {
    return {
      left: margin,
      top: margin,
      width: fallbackWidth,
    };
  }

  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const width = Math.min(fallbackWidth, Math.max(280, viewportWidth - margin * 2));
  const usableCardHeight = Math.min(cardHeight, viewportHeight - margin * 2);
  const right = Math.max(margin, viewportWidth - width - margin);
  const bottom = Math.max(margin, viewportHeight - usableCardHeight - margin);

  if (!target) {
    return {
      left: right,
      top: margin,
      width,
    };
  }

  const positions = [
    { left: margin, top: margin },
    { left: right, top: margin },
    { left: margin, top: bottom },
    { left: right, top: bottom },
  ];
  const paddedTarget = {
    height: target.height + margin * 2,
    left: target.left - margin,
    top: target.top - margin,
    width: target.width + margin * 2,
  };
  const targetMidpoint = rectCenter(target);

  const selectedPosition = positions.reduce((best, position) => {
    const candidate = { ...position, height: usableCardHeight, width };
    const bestRect = { ...best, height: usableCardHeight, width };
    const candidateOverlap = rectOverlapArea(candidate, paddedTarget);
    const bestOverlap = rectOverlapArea(bestRect, paddedTarget);

    if (candidateOverlap !== bestOverlap) {
      return candidateOverlap < bestOverlap ? position : best;
    }

    return distanceSquared(rectCenter(candidate), targetMidpoint) > distanceSquared(rectCenter(bestRect), targetMidpoint)
      ? position
      : best;
  });

  return {
    ...selectedPosition,
    width,
  };
}

export function GuidedTour({ activeTab, onSelectTab, steps }: GuidedTourProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [cardRect, setCardRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const activeStep = steps[stepIndex];
  const position = useMemo(() => cardPosition(targetRect, cardRect?.height), [cardRect?.height, targetRect]);

  useEffect(() => {
    if (stepIndex <= steps.length - 1) {
      return;
    }

    setStepIndex(Math.max(0, steps.length - 1));
  }, [stepIndex, steps.length]);

  useEffect(() => {
    if (!isOpen || !activeStep?.tab || activeStep.tab === activeTab) {
      return;
    }

    onSelectTab(activeStep.tab);
  }, [activeStep, activeTab, isOpen, onSelectTab]);

  useEffect(() => {
    if (!isOpen || !activeStep) {
      return;
    }

    let cancelled = false;
    let frame = 0;
    let retry = 0;

    const update = (target = resolveTarget(activeStep)) => {
      setTargetRect(readRect(target));

      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        setCardRect({
          height: rect.height,
          left: rect.left,
          top: rect.top,
          width: rect.width,
        });
      }

      return Boolean(target);
    };

    const skipStep = () => {
      setStepIndex((current) => {
        if (current >= steps.length - 1) {
          setIsOpen(false);
          return current;
        }

        return current + 1;
      });
    };

    const settleTarget = () => {
      if (cancelled) {
        return;
      }

      const target = resolveTarget(activeStep);

      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });

        frame = window.setTimeout(() => {
          update(target);
        }, 260);
        return;
      }

      if (retry < 12) {
        retry += 1;
        frame = window.setTimeout(settleTarget, 90);
        return;
      }

      if (activeStep.skipIfMissing ?? true) {
        skipStep();
      }
    };

    const updateFromCurrentTarget = () => {
      update();
    };

    settleTarget();
    window.addEventListener("resize", updateFromCurrentTarget);
    window.addEventListener("scroll", updateFromCurrentTarget, true);

    return () => {
      cancelled = true;
      window.clearTimeout(frame);
      window.removeEventListener("resize", updateFromCurrentTarget);
      window.removeEventListener("scroll", updateFromCurrentTarget, true);
    };
  }, [activeStep, activeTab, isOpen, steps.length]);

  useEffect(() => {
    if (!isOpen || !cardRef.current) {
      return;
    }

    const rect = cardRef.current.getBoundingClientRect();
    setCardRect({
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width,
    });
  }, [isOpen, stepIndex, position.left, position.top]);

  const nextStep = () => {
    setStepIndex((current) => Math.min(steps.length - 1, current + 1));
  };

  const previousStep = () => {
    setStepIndex((current) => Math.max(0, current - 1));
  };

  const startTour = () => {
    if (!steps.length) {
      return;
    }

    setStepIndex(0);
    setIsOpen(true);
  };

  const targetAnchor = targetRect && cardRect ? rectAnchorPoint(targetRect, rectCenter(cardRect)) : null;
  const cardAnchor = cardRect && targetRect ? rectAnchorPoint(cardRect, rectCenter(targetRect)) : null;

  return (
    <>
      <button className="tour-launch" data-tour="tour-launch" onClick={startTour} type="button">
        <HelpCircle aria-hidden size={16} />
        Tour
      </button>

      {isOpen && activeStep && (
        <div className="tour-layer" data-tour-open="true" role="presentation">
          {targetRect && (
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
          )}

          {targetAnchor && cardAnchor && (
            <svg aria-hidden className="tour-arrow">
              <defs>
                <marker id="tour-arrow-head" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                  <path d="M0,0 L8,4 L0,8 Z" />
                </marker>
              </defs>
              <path
                d={`M ${cardAnchor.x.toFixed(1)} ${cardAnchor.y.toFixed(1)} L ${targetAnchor.x.toFixed(1)} ${targetAnchor.y.toFixed(1)}`}
                markerEnd="url(#tour-arrow-head)"
              />
              <circle cx={targetAnchor.x} cy={targetAnchor.y} r="16" />
            </svg>
          )}

          <section
            aria-live="polite"
            className="tour-card"
            ref={cardRef}
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
            }}
          >
            <div className="tour-card-head">
              <span>
                Step {stepIndex + 1} of {steps.length}
              </span>
              <button aria-label="Close tutorial" onClick={() => setIsOpen(false)} type="button">
                <X aria-hidden size={15} />
              </button>
            </div>
            <strong>{activeStep.title}</strong>
            <p>{activeStep.body}</p>
            <label className="tour-step-jump">
              <span>Jump to</span>
              <select
                aria-label="Jump to tour step"
                onChange={(event) => {
                  const nextIndex = steps.findIndex((step) => step.id === event.target.value);
                  if (nextIndex >= 0) {
                    setStepIndex(nextIndex);
                  }
                }}
                value={activeStep.id}
              >
                {steps.map((step, index) => (
                  <option key={step.id} value={step.id}>
                    {index + 1}. {step.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="tour-progress" aria-hidden>
              {steps.map((step, index) => (
                <i className={index === stepIndex ? "is-active" : undefined} key={step.id} />
              ))}
            </div>
            <div className="tour-actions">
              <button disabled={stepIndex === 0} onClick={previousStep} type="button">
                <ChevronLeft aria-hidden size={15} />
                Back
              </button>
              {stepIndex === steps.length - 1 ? (
                <button onClick={() => setIsOpen(false)} type="button">
                  Finish
                </button>
              ) : (
                <button onClick={nextStep} type="button">
                  Next
                  <ChevronRight aria-hidden size={15} />
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
