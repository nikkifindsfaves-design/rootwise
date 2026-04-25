import Link from "next/link";

export default function CookiesPage() {
  return (
    <main className="min-h-[100dvh] bg-[var(--dg-cream)] px-5 py-8 text-[var(--dg-brown-dark)] sm:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <p className="mb-5 text-sm">
          <Link
            href="/login"
            className="text-[var(--dg-brown-outline)] underline underline-offset-4 hover:text-[var(--dg-brown-dark)]"
          >
            Back to login
          </Link>
        </p>

        <article className="rounded-lg border border-[var(--dg-paper-border)] bg-white px-5 py-6 text-[#595959] sm:px-8 sm:py-8">
          <h1 className="text-3xl font-semibold text-black">Cookie Policy</h1>
          <p className="mt-3">
            <strong>Dead Gossip</strong>
            <br />
            Operated by Smith Digital LLC
            <br />
            Effective Date: April 25, 2025
            <br />
            Last Updated: April 25, 2025
          </p>

          <hr className="my-6 border-[var(--dg-paper-border)]" />

          <h2 className="text-xl font-semibold text-black">1. What Are Cookies</h2>
          <p className="mt-3 leading-relaxed">
            Cookies are small text files placed on your device when you visit a
            website or use a web application. They are widely used to make
            applications work, remember your preferences, and provide a secure
            experience.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-black">
            2. How Dead Gossip Uses Cookies
          </h2>
          <p className="mt-3 leading-relaxed">
            Dead Gossip uses cookies only for the essential operation of the
            Service. We do not use cookies for advertising, behavioral tracking
            or analytics.
          </p>

          <h3 className="mt-5 text-lg font-semibold text-black">
            Strictly Necessary Cookies
          </h3>
          <p className="mt-3 leading-relaxed">
            These cookies are required for the Service to function. They cannot
            be disabled without breaking core functionality.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-[var(--dg-paper-border)] px-3 py-2 text-left text-black">
                    Cookie
                  </th>
                  <th className="border border-[var(--dg-paper-border)] px-3 py-2 text-left text-black">
                    Provider
                  </th>
                  <th className="border border-[var(--dg-paper-border)] px-3 py-2 text-left text-black">
                    Purpose
                  </th>
                  <th className="border border-[var(--dg-paper-border)] px-3 py-2 text-left text-black">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    Authentication session token
                  </td>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    Supabase
                  </td>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    Keeps you logged in to your account
                  </td>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    Session / up to 1 week
                  </td>
                </tr>
                <tr>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    CSRF protection token
                  </td>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    Supabase
                  </td>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    Protects against cross-site request forgery attacks
                  </td>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    Session
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-3 leading-relaxed">
            These cookies are set by Supabase, our database and authentication
            provider, on behalf of Dead Gossip. They do not track your activity
            across other websites and do not contain personally identifiable
            information beyond what is necessary to maintain your authenticated
            session.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-black">
            3. Cookies We Do Not Use
          </h2>
          <p className="mt-3 leading-relaxed">We do not use:</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>Advertising or targeting cookies</li>
            <li>Analytics cookies (such as Google Analytics)</li>
            <li>Social media tracking cookies</li>
            <li>Third-party behavioral tracking of any kind</li>
          </ul>

          <h2 className="mt-8 text-xl font-semibold text-black">
            4. Managing Cookies
          </h2>
          <p className="mt-3 leading-relaxed">
            Because the cookies we use are strictly necessary for authentication
            and security, disabling them will prevent you from logging in or
            using the Service.
          </p>
          <p className="mt-3 leading-relaxed">
            You can manage or delete cookies through your browser settings.
            Instructions for common browsers:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <strong>Chrome:</strong> Settings &gt; Privacy and Security &gt;
              Cookies and other site data
            </li>
            <li>
              <strong>Firefox:</strong> Settings &gt; Privacy &amp; Security &gt;
              Cookies and Site Data
            </li>
            <li>
              <strong>Safari:</strong> Settings &gt; Safari &gt; Privacy &amp;
              Security
            </li>
            <li>
              <strong>Edge:</strong> Settings &gt; Cookies and site permissions
            </li>
          </ul>
          <p className="mt-3 leading-relaxed">
            Note that clearing cookies will log you out of your Dead Gossip
            account and you will need to sign in again.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-black">
            5. Changes to This Policy
          </h2>
          <p className="mt-3 leading-relaxed">
            We may update this Cookie Policy if we add new functionality that
            requires additional cookies. We will notify you of any material
            changes in accordance with our Privacy Policy.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-black">6. Contact</h2>
          <p className="mt-3 leading-relaxed">
            For questions about this Cookie Policy, contact us at:
          </p>
          <p className="mt-3 leading-relaxed">
            <strong>Smith Digital LLC, DBA Dead Gossip</strong>
            <br />
            privacy@deadgossip.app
          </p>
        </article>
      </div>
    </main>
  );
}
