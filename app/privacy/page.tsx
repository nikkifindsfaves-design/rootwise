import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-[100dvh] bg-[var(--dg-cream)] px-5 py-10 text-[var(--dg-brown-dark)] sm:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <p className="mb-6 text-sm">
          <Link
            href="/login"
            className="text-[var(--dg-brown-outline)] underline underline-offset-4 hover:text-[var(--dg-brown-dark)]"
          >
            Back to login
          </Link>
        </p>

        <article className="rounded-lg border border-[var(--dg-paper-border)] bg-white px-5 py-6 sm:px-8 sm:py-8">
          <h1 className="text-3xl font-semibold" style={{ fontFamily: "Arial, sans-serif" }}>
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-[var(--dg-brown-muted)]" style={{ fontFamily: "Arial, sans-serif" }}>
            Last updated May 01, 2026
          </p>

          <div className="mt-6 space-y-4 text-sm leading-relaxed text-[#595959]" style={{ fontFamily: "Arial, sans-serif" }}>
            <p>
              We are Smith Digital LLC, doing business as Dead Gossip. These
              Terms of Service govern your access to and use of Dead Gossip.
            </p>
            <p>
              By using the site, you agree to these terms, including your
              obligations around acceptable use, account security, and legal
              compliance.
            </p>
            <p>
              This page is intentionally hosted at <strong>/privacy</strong> to
              match your requested URL path.
            </p>
            <p>
              Contact: nikkifindsfaves@gmail.com
            </p>
          </div>
        </article>
      </div>
    </main>
  );
}
