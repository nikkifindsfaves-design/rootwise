import Link from "next/link";

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-semibold text-black">Privacy Policy</h1>
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

          <h2 className="text-xl font-semibold text-black">1. Introduction</h2>
          <p className="mt-3 leading-relaxed">
            Smith Digital LLC ("we," "us," or "our") operates Dead Gossip at
            deadgossip.app ("the Service"). This Privacy Policy explains how we
            collect, use, store and share information about you when you use our
            Service. It also describes your rights regarding your personal
            information and how to exercise them.
          </p>
          <p className="mt-3 leading-relaxed">
            By using the Service, you agree to the collection and use of
            information as described in this policy.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-black">
            2. Information We Collect
          </h2>
          <h3 className="mt-4 text-lg font-semibold text-black">
            Information You Provide Directly
          </h3>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <strong>Account information:</strong> Your email address and
              password when you register for an account
            </li>
            <li>
              <strong>Profile information:</strong> Any optional profile details
              you choose to provide
            </li>
            <li>
              <strong>Uploaded documents:</strong> Historical documents, images
              and files you upload for genealogy research
            </li>
            <li>
              <strong>Research data:</strong> Family names, dates, places and
              other genealogical information you enter or that is extracted from
              your documents
            </li>
            <li>
              <strong>Communications:</strong> Messages you send to our support
              team
            </li>
          </ul>

          <h3 className="mt-5 text-lg font-semibold text-black">
            Information Collected Automatically
          </h3>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <strong>Usage data:</strong> Pages visited, features used, time
              spent on the Service and other interaction data
            </li>
            <li>
              <strong>Device and technical data:</strong> Browser type, operating
              system, IP address and general location derived from your IP
              address
            </li>
            <li>
              <strong>Authentication data:</strong> Session tokens and
              authentication state managed through cookies
            </li>
          </ul>

          <h3 className="mt-5 text-lg font-semibold text-black">
            Information We Do Not Collect
          </h3>
          <p className="mt-3 leading-relaxed">
            We do not collect payment card numbers or banking information.
            Payment processing is handled entirely by Stripe. We receive only
            confirmation of payment status.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-black">
            3. How We Use Your Information
          </h2>
          <p className="mt-3 leading-relaxed">We use your information to:</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>Provide, operate and maintain the Service</li>
            <li>Process your uploaded documents through AI-powered extraction</li>
            <li>Authenticate your identity and maintain your session</li>
            <li>Respond to your support requests and communications</li>
            <li>
              Send you transactional emails including account notifications and
              updates to this policy
            </li>
            <li>Detect and prevent fraud, abuse and security incidents</li>
            <li>Comply with applicable legal obligations</li>
          </ul>

          <h2 className="mt-8 text-xl font-semibold text-black">
            4. AI Processing of Your Documents
          </h2>
          <p className="mt-3 leading-relaxed">
            When you upload a document, its contents are transmitted to
            Anthropic, PBC for AI-assisted processing and extraction. Anthropic
            processes this data solely to return extraction results to us for
            display in your account. Anthropic does not use API inputs to train
            its models by default. You can review Anthropic&apos;s privacy policy at{" "}
            <a
              href="https://www.anthropic.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#3030F1] underline"
            >
              https://www.anthropic.com/privacy
            </a>
            .
          </p>

          <h2 className="mt-8 text-xl font-semibold text-black">
            5. How We Share Your Information
          </h2>
          <p className="mt-3 leading-relaxed">
            We do not sell your personal information. We do not share your
            personal information with third parties for their own marketing
            purposes.
          </p>
          <p className="mt-3 leading-relaxed">
            We share your information only in the following circumstances:
          </p>

          <h3 className="mt-5 text-lg font-semibold text-black">
            Service Providers (Sub-processors)
          </h3>
          <p className="mt-3 leading-relaxed">
            We share data with the following third-party service providers who
            process data on our behalf and are contractually bound to protect it:
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-[var(--dg-paper-border)] px-3 py-2 text-left text-black">
                    Provider
                  </th>
                  <th className="border border-[var(--dg-paper-border)] px-3 py-2 text-left text-black">
                    Purpose
                  </th>
                  <th className="border border-[var(--dg-paper-border)] px-3 py-2 text-left text-black">
                    Privacy Policy
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    Anthropic, PBC
                  </td>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    AI document processing
                  </td>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    <a
                      href="https://www.anthropic.com/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#3030F1] underline"
                    >
                      https://www.anthropic.com/privacy
                    </a>
                  </td>
                </tr>
                <tr>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    Supabase
                  </td>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    Database and file storage
                  </td>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    <a
                      href="https://supabase.com/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#3030F1] underline"
                    >
                      https://supabase.com/privacy
                    </a>
                  </td>
                </tr>
                <tr>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    Vercel
                  </td>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    Application hosting
                  </td>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    <a
                      href="https://vercel.com/legal/privacy-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#3030F1] underline"
                    >
                      https://vercel.com/legal/privacy-policy
                    </a>
                  </td>
                </tr>
                <tr>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    Stripe
                  </td>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    Payment processing
                  </td>
                  <td className="border border-[var(--dg-paper-border)] px-3 py-2">
                    <a
                      href="https://stripe.com/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#3030F1] underline"
                    >
                      https://stripe.com/privacy
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="mt-5 text-lg font-semibold text-black">
            Legal Requirements
          </h3>
          <p className="mt-3 leading-relaxed">
            We may disclose your information if required to do so by law, court
            order or governmental authority, or if we believe in good faith that
            disclosure is necessary to protect our rights, protect your safety or
            the safety of others, or investigate fraud.
          </p>

          <h3 className="mt-5 text-lg font-semibold text-black">
            Business Transfers
          </h3>
          <p className="mt-3 leading-relaxed">
            If Smith Digital LLC is involved in a merger, acquisition or sale of
            assets, your information may be transferred as part of that
            transaction. We will provide notice before your information becomes
            subject to a different privacy policy.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-black">
            6. Data Retention
          </h2>
          <p className="mt-3 leading-relaxed">
            We retain your personal information and uploaded documents for as
            long as your account is active. When you delete your account, we will
            delete your personal data, uploaded documents and extracted research
            data from our systems within 30 days, except where retention is
            required by applicable law.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-black">7. Security</h2>
          <p className="mt-3 leading-relaxed">
            We implement appropriate technical and organizational measures to
            protect your personal information against unauthorized access, loss or
            destruction. These measures include encrypted data transmission,
            row-level security controls on our database, and access controls
            limiting which personnel can access user data.
          </p>
          <p className="mt-3 leading-relaxed">
            No security system is impenetrable. We cannot guarantee the absolute
            security of your information and are not responsible for unauthorized
            access resulting from circumstances beyond our reasonable control.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-black">
            8. Your Rights and Choices
          </h2>
          <p className="mt-3 leading-relaxed">
            You have the following rights with respect to your personal
            information:
          </p>
          <p className="mt-3 leading-relaxed">
            <strong>Access:</strong> You may request a copy of the personal
            information we hold about you.
          </p>
          <p className="mt-2 leading-relaxed">
            <strong>Correction:</strong> You may update or correct inaccurate
            information through your account settings or by contacting us.
          </p>
          <p className="mt-2 leading-relaxed">
            <strong>Deletion:</strong> You may delete your account and associated
            data at any time through your account settings at
            deadgossip.app/account. We will process your deletion request within
            30 days.
          </p>
          <p className="mt-2 leading-relaxed">
            <strong>Data Export:</strong> You may request an export of your
            research data in a machine-readable format by contacting us at
            privacy@deadgossip.app.
          </p>
          <p className="mt-2 leading-relaxed">
            <strong>Opt-Out of Marketing:</strong> You may opt out of
            non-transactional emails by using the unsubscribe link in any
            marketing email or by contacting us directly.
          </p>
          <p className="mt-3 leading-relaxed">
            To exercise any of these rights, contact us at privacy@deadgossip.app.
            We will respond to verified requests within 45 days.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-black">
            9. California Residents — CCPA Rights
          </h2>
          <p className="mt-3 leading-relaxed">
            If you are a California resident, you have additional rights under
            the California Consumer Privacy Act (CCPA):
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              The right to know what personal information we collect, use,
              disclose and sell
            </li>
            <li>The right to request deletion of your personal information</li>
            <li>
              The right to opt out of the sale of your personal information (we
              do not sell personal information)
            </li>
            <li>
              The right to non-discrimination for exercising your privacy rights
            </li>
          </ul>
          <p className="mt-3 leading-relaxed">
            To submit a CCPA request, contact us at privacy@deadgossip.app. We
            will verify your identity before processing your request.
          </p>
          <p className="mt-3 leading-relaxed">
            We do not sell personal information as defined under the CCPA. We do
            not use or disclose sensitive personal information for purposes beyond
            those permitted by the CCPA.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-black">
            10. Children&apos;s Privacy
          </h2>
          <p className="mt-3 leading-relaxed">
            The Service is not directed to children under the age of 13. We do
            not knowingly collect personal information from children under 13. If
            you believe a child under 13 has provided us with personal
            information, contact us at privacy@deadgossip.app and we will delete
            that information promptly.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-black">
            11. Cookies and Tracking
          </h2>
          <p className="mt-3 leading-relaxed">
            We use cookies strictly necessary for the operation of the Service,
            including session authentication cookies managed by Supabase. We do
            not use advertising cookies or third-party tracking cookies. For more
            information, see our Cookie Policy at deadgossip.app/cookies.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-black">
            12. Changes to This Policy
          </h2>
          <p className="mt-3 leading-relaxed">
            We may update this Privacy Policy from time to time. We will notify
            you of material changes by sending an email to the address associated
            with your account at least 14 days before the changes take effect.
            Your continued use of the Service after the effective date
            constitutes acceptance of the updated policy.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-black">13. Contact</h2>
          <p className="mt-3 leading-relaxed">
            For privacy-related questions, requests or complaints, contact us at:
          </p>
          <p className="mt-3 leading-relaxed">
            <strong>Smith Digital LLC, DBA Dead Gossip</strong>
            <br />
            privacy@deadgossip.app
            <br />
            Indiana, United States
          </p>
        </article>
      </div>
    </main>
  );
}
