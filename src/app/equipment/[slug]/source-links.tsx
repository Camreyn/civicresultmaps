import { ExternalLink } from "lucide-react";

import {
  sourcesForEquipmentRecord,
  type EquipmentSource,
} from "@/lib/equipment-catalog";
import styles from "../equipment.module.css";

type SourceLinksProps = {
  sourceIds: readonly string[];
  sources: readonly EquipmentSource[];
};

export function SourceLinks({ sourceIds, sources }: SourceLinksProps) {
  const selected = sourcesForEquipmentRecord(sourceIds, sources);
  return (
    <ul className={styles.inlineSources}>
      {selected.map((source) => (
        <li key={source.id}>
          <a href={source.url} rel="noreferrer" target="_blank">
            {source.publisher}: {source.title} <ExternalLink aria-hidden size={12} />
          </a>
          <span>{source.pageOrSection}</span>
        </li>
      ))}
    </ul>
  );
}
