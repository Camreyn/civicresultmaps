"use client";

import { ChevronLeft, ChevronRight, HelpCircle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type TourTabKey =
  | "map"
  | "review"
  | "history"
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

function readRect(selector: string, fallbackSelector?: string): Rect | null {
  const target = document.querySelector(selector) ?? (fallbackSelector ? document.querySelector(fallbackSelector) : null);

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

function cardPosition(target: Rect | null) {
  const width = 360;
  const margin = 18;

  if (!target) {
    return {
      left: margin,
      top: margin,
      width,
    };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const rightSide = target.left + target.width + margin;
  const leftSide = target.left - width - margin;
  const below = target.top + target.height + margin;
  const above = target.top - 220 - margin;
  const canUseRight = rightSide + width < viewportWidth - margin;
  const canUseLeft = leftSide > margin;
  const canUseBelow = below + 220 < viewportHeight - margin;

  if (canUseRight) {
    return {
      left: rightSide,
      top: Math.max(margin, Math.min(target.top, viewportHeight - 260)),
      width,
    };
  }

  if (canUseLeft) {
    return {
      left: leftSide,
      top: Math.max(margin, Math.min(target.top, viewportHeight - 260)),
      width,
    };
  }

  return {
    left: Math.max(margin, Math.min(target.left, viewportWidth - width - margin)),
    top: canUseBelow ? below : Math.max(margin, above),
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
  const position = useMemo(() => cardPosition(targetRect), [targetRect]);

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

    let frame = 0;

    const update = () => {
      setTargetRect(readRect(activeStep.target, activeStep.fallbackTarget) ?? readRect("[data-tour='workspace']"));

      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        setCardRect({
          height: rect.height,
          left: rect.left,
          top: rect.top,
          width: rect.width,
        });
      }
    };

    const scrollToTarget = () => {
      const target =
        document.querySelector(activeStep.target) ??
        (activeStep.fallbackTarget ? document.querySelector(activeStep.fallbackTarget) : null);
      target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });

      frame = window.setTimeout(() => {
        update();
      }, 260);
    };

    scrollToTarget();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      window.clearTimeout(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [activeStep, activeTab, isOpen]);

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
    setStepIndex(0);
    setIsOpen(true);
  };

  const targetCenter = targetRect
    ? {
        x: targetRect.left + targetRect.width / 2,
        y: targetRect.top + targetRect.height / 2,
      }
    : null;
  const cardCenter = cardRect
    ? {
        x: cardRect.left + cardRect.width / 2,
        y: cardRect.top + cardRect.height / 2,
      }
    : null;

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

          {targetCenter && cardCenter && (
            <svg aria-hidden className="tour-arrow">
              <defs>
                <marker id="tour-arrow-head" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                  <path d="M0,0 L8,4 L0,8 Z" />
                </marker>
              </defs>
              <path
                d={`M ${cardCenter.x.toFixed(1)} ${cardCenter.y.toFixed(1)} C ${cardCenter.x.toFixed(1)} ${targetCenter.y.toFixed(
                  1,
                )}, ${targetCenter.x.toFixed(1)} ${cardCenter.y.toFixed(1)}, ${targetCenter.x.toFixed(1)} ${targetCenter.y.toFixed(1)}`}
                markerEnd="url(#tour-arrow-head)"
              />
              <circle cx={targetCenter.x} cy={targetCenter.y} r="16" />
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
