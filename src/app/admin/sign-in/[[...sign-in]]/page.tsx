import type { Metadata } from "next";
import { isClerkConfigured } from "@/lib/ui-layout-auth";
import styles from "../../layout/layout-editor.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Layout Admin Sign In", robots: { index: false, follow: false } };

export default async function LayoutAdminSignInPage() {
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
        <SignIn fallbackRedirectUrl="/admin/layout" />
      </section>
    </main>
  );
}
