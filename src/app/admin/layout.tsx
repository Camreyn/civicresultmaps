import type { ReactNode } from "react";
import { isClerkConfigured } from "@/lib/ui-layout-auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!isClerkConfigured()) return children;
  const { ClerkProvider } = await import("@clerk/nextjs");
  return <ClerkProvider dynamic>{children}</ClerkProvider>;
}
