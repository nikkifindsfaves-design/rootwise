import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-[100dvh] bg-[var(--dg-cream)] px-5 py-6 text-[var(--dg-brown-dark)] sm:px-8 sm:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <p className="mb-4 text-sm">
          <Link
            href="/login"
            className="text-[var(--dg-brown-outline)] underline underline-offset-4 hover:text-[var(--dg-brown-dark)]"
          >
            Back to login
          </Link>
        </p>

        <section className="overflow-hidden rounded-lg border border-[var(--dg-paper-border)] bg-white">
          <iframe
            title="Dead Gossip Terms of Service"
            src="https://app.termly.io/policy-viewer/policy.html?policyUUID=09439ad7-bf4d-478f-b5c4-489cfe9ca17b"
            className="h-[calc(100dvh-7.5rem)] min-h-[42rem] w-full"
          />
        </section>

        <p className="mt-3 text-xs text-[var(--dg-brown-muted)]">
          If the embedded document does not load, open it directly{" "}
          <a
            href="https://app.termly.io/policy-viewer/policy.html?policyUUID=09439ad7-bf4d-478f-b5c4-489cfe9ca17b"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            here
          </a>
          .
        </p>
      </div>
    </main>
  );
}
