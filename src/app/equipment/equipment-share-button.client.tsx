"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

export function EquipmentShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.append(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
    }
    setCopied(true);
  }

  return (
    <button className="equipment-share-button" onClick={share} type="button">
      {copied ? <Check aria-hidden size={15} /> : <Share2 aria-hidden size={15} />}
      {copied ? "Link copied" : "Share this state page"}
    </button>
  );
}
