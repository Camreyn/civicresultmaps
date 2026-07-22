"use client";

import Image from "next/image";
import { ExternalLink, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { EquipmentEvidenceImage, EquipmentSource } from "@/lib/equipment-catalog";
import styles from "../equipment.module.css";

export function EquipmentReferenceLightbox({
  image,
  onClose,
  sources,
}: {
  image: EquipmentEvidenceImage;
  onClose: () => void;
  sources: EquipmentSource[];
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = `reference-image-title-${image.id}`;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1) ?? first;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.referenceLightboxBackdrop}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.referenceLightbox}
        ref={dialogRef}
        role="dialog"
      >
        <div className={styles.referenceLightboxHead}>
          <div>
            <span>Source-linked reference</span>
            <strong id={titleId}>{image.caption}</strong>
          </div>
          <button aria-label="Close expanded reference image" onClick={onClose} ref={closeButtonRef} type="button">
            <X aria-hidden size={18} />
          </button>
        </div>
        <div className={styles.referenceLightboxImage}>
          <Image
            alt={image.alt}
            height={image.height}
            src={image.assetUrl}
            unoptimized
            width={image.width}
          />
        </div>
        <div className={styles.referenceLightboxMeta}>
          <p>{image.caveat}</p>
          <span>{image.pageOrSection} - {image.derivativeNote}</span>
          <div className={styles.referenceSourceLinks}>
            {sources.map((source) => (
              <a href={source.url} key={source.id} rel="noreferrer" target="_blank">
                <ExternalLink aria-hidden size={13} />
                {source.publisher}: {source.title}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
