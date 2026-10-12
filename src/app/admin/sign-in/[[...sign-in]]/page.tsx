import type { Metadata } from "next";
import { isClerkConfigured } from "@/lib/ui-layout-auth";
import styles from "../../layout/layout-editor.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Layout Admin Sign In", robots: { index: false, follow: false } };

export default async function LayoutAdminSignInPage({ searchParams }: { searchParams: Promise<{ redirect_url?: string }> }) {
  const { redirect_url } = await searchParams;
  // Only known private destinations are accepted; arbitrary URLs cannot become redirects.
  const destination = redirect_url === "/admin/connections" ? "/admin/connections" : "/admin/layout";
  if (!isClerkConfigured()) {
    return (
      <main className={styles.page}>
        <section className={styles.setupCard}>
          <h1>Clerk is not configured</h1>
          <p>The admin sign-in surface remains disabled. The public workspace is unaffected.</p>
        </section>
      </main>
    );
  }
  const { SignIn } = await import("@clerk/nextjs");
  return (
    <main className={styles.page}>
      <section className={styles.setupCard}>
        <SignIn fallbackRedirectUrl={destination} />
      </section>
    </main>
  );
}
