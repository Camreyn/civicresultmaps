"use client";

import Image from "next/image";
import { ExternalLink, Maximize2, X } from "lucide-react";
import { useCallback, useState } from "react";

import type { EquipmentReferenceImage, EquipmentSource } from "@/lib/equipment-catalog";
import styles from "../equipment.module.css";
import { EquipmentReferenceLightbox } from "./equipment-reference-lightbox.client";

export function EquipmentReferenceGallery({
  images,
  onClose,
  sources,
}: {
  images: readonly EquipmentReferenceImage[];
  onClose: () => void;
  sources: readonly EquipmentSource[];
}) {
  const [expandedImageId, setExpandedImageId] = useState<string | null>(null);
  const closeExpandedImage = useCallback(() => setExpandedImageId(null), []);
  const expandedImage = images.find((image) => image.id === expandedImageId) ?? null;

  return (
    <>
      <aside
        aria-labelledby="equipment-reference-gallery-title"
        className={styles.referenceGalleryPanel}
        id="equipment-reference-gallery"
      >
        <div className={styles.referenceGalleryHead}>
          <div>
            <span>Sourced visual evidence</span>
            <strong id="equipment-reference-gallery-title">Reference photos</strong>
          </div>
          <button aria-label="Close reference photos" onClick={onClose} type="button">
            <X aria-hidden size={17} />
          </button>
        </div>
        <p className={styles.referenceGalleryIntro}>
          These images support external appearance only. Their source scope and limitations remain attached.
        </p>
        <div className={styles.referenceGalleryList}>
          {images.map((image) => {
            const imageSources = sources.filter((source) => image.sourceIds.includes(source.id));
            return (
              <article className={styles.referenceGalleryCard} key={image.id}>
                <button
                  aria-label={`Expand: ${image.caption}`}
                  className={styles.referenceGalleryImageButton}
                  onClick={() => setExpandedImageId(image.id)}
                  type="button"
                >
                  <Image
                    alt={image.alt}
                    fill
                    sizes="(max-width: 560px) 82vw, 270px"
                    src={image.assetUrl}
                    unoptimized
                  />
                  <span><Maximize2 aria-hidden size={13} /> Expand</span>
                </button>
                <div className={styles.referenceGalleryCopy}>
                  <span>{image.kind.replaceAll("_", " ")}</span>
                  <strong>{image.caption}</strong>
                  <p>{image.caveat}</p>
                  <small>{image.pageOrSection}</small>
                </div>
                <div className={styles.referenceSourceLinks}>
                  {imageSources.map((source) => (
                    <a href={source.url} key={source.id} rel="noreferrer" target="_blank">
                      <ExternalLink aria-hidden size={12} />
                      View source
                    </a>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </aside>
      {expandedImage && (
        <EquipmentReferenceLightbox
          image={expandedImage}
          onClose={closeExpandedImage}
          sources={sources.filter((source) => expandedImage.sourceIds.includes(source.id))}
        />
      )}
    </>
  );
}
