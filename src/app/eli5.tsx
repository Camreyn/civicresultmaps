"use client";

import { HelpCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

type Eli5Props = {
  children: ReactNode;
  title?: string;
};

export function Eli5({ children, title = "ELI5" }: Eli5Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="eli5">
      <button
        aria-expanded={isOpen}
        className="eli5-button"
        onClick={() => setIsOpen((value) => !value)}
        type="button"
      >
        <HelpCircle aria-hidden size={14} />
        {title}
      </button>
      {isOpen && (
        <div className="eli5-panel" role="note">
          {children}
        </div>
      )}
    </div>
  );
}
