import type { Metadata } from "next";
import Link from "next/link";

import { FounderPlaceholder } from "@/components/FounderPlaceholder";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { formatPrice, formatPriceWithInterval, PRO_MONTHLY, RESUME_UNLOCK } from "@/lib/catalog";
import { SUPPORT_EMAIL } from "@/lib/legal";
import { FAIR_USE_SUMMARY } from "@/lib/limits";

export const metadata: Metadata = {
  title: "Terms of Service | easyCV",
  description: "The rules for using easyCV, including payments, subscriptions and AI output.",
};

const mail = (
  <a className="underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>
    {SUPPORT_EMAIL}
  </a>
);

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms are an agreement between you and{" "}
          <FounderPlaceholder>legal entity name and postal address</FounderPlaceholder> (&ldquo;easyCV&rdquo;,
          &ldquo;we&rdquo;, &ldquo;us&rdquo;). By signing in, uploading files or paying, you agree to them. Our{" "}
          <Link className="underline underline-offset-2" href="/privacy">Privacy Policy</Link> explains how we handle
          your data.
        </p>
      }
    >
      <LegalSection id="service" title="1. What easyCV does">
        <p>
          easyCV lets you upload existing résumés and career documents, combines them into one structured résumé using
          AI, scores it, suggests improvements, compares it with job descriptions, and lets you download it after
          purchase. Processing is not instant and can be delayed; your upload stays queued until it can be processed.
          We may change, add or remove features.
        </p>
      </LegalSection>

      <LegalSection id="accounts" title="2. Accounts and eligibility">
        <p>
          You must be at least 16 to use easyCV. You sign in with Seridian Auth and are responsible for activity on
          your account. Tell us at {mail} if you think someone else is using it.
        </p>
      </LegalSection>

      <LegalSection id="content" title="3. Your content">
        <p>
          You keep ownership of the files and text you upload and the résumés generated from them. You give us
          permission to store, process and transmit that content, including to the providers listed in the Privacy
          Policy, only to run easyCV for you. You confirm you have the right to upload it, and that it doesn&apos;t
          contain anyone else&apos;s personal data without their permission.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" title="4. Acceptable use">
        <p>Don&apos;t:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>upload malware, or content that is illegal, or that you don&apos;t have the right to share;</li>
          <li>use easyCV to impersonate someone or to create false or misleading credentials;</li>
          <li>try to break, overload, scrape or get around limits or payments in the service, or access other people&apos;s data;</li>
          <li>use automated means to send large volumes of requests, or resell the service without our written permission.</li>
        </ul>
        <p>{FAIR_USE_SUMMARY} When you reach a limit we tell you when you can try again.</p>
        <p>We may suspend accounts that break these rules.</p>
      </LegalSection>

      <LegalSection id="ai-output" title="5. AI output: no guarantees">
        <p>
          easyCV&apos;s résumés, scores, suggestions and job-match results are produced by AI and can be inaccurate or
          incomplete. You are responsible for checking everything before you use it. We do not guarantee that a résumé
          will pass any applicant tracking system (ATS) such as Taleo, Greenhouse or Workday, be ranked in any
          particular way, or lead to interviews or job offers. easyCV is not career, legal or immigration advice.
        </p>
      </LegalSection>

      <LegalSection id="payments" title="6. Payments">
        <p>Prices are in US dollars and are shown before you pay. Payments are processed by Stripe. There are two separate products:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>{RESUME_UNLOCK.name} ({formatPriceWithInterval(RESUME_UNLOCK)}).</strong> A single payment that
            unlocks one résumé: {RESUME_UNLOCK.unlocks.join("; ").toLowerCase()}. It does not renew.
          </li>
          <li>
            <strong>{PRO_MONTHLY.name} ({formatPriceWithInterval(PRO_MONTHLY)}).</strong> A subscription that unlocks
            every résumé you open while it is active and gives unlimited Auto-Improve passes.
          </li>
        </ul>
        <p>
          <strong>Refunds:</strong> <FounderPlaceholder>refund policy, e.g. refund window and how to request one</FounderPlaceholder>.
          This doesn&apos;t limit any rights you have under consumer law.
        </p>
      </LegalSection>

      <LegalSection id="auto-renewal" title="7. Subscription auto-renewal and cancellation">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            {PRO_MONTHLY.name} costs {formatPrice(PRO_MONTHLY)} per month. You are charged when you subscribe and then
            automatically every month on the same date <strong>until you cancel</strong>.
          </li>
          <li>
            Cancel any time, online: go to <Link className="underline underline-offset-2" href="/pricing">Pricing</Link>{" "}
            and choose &ldquo;Manage or cancel subscription&rdquo;, which opens Stripe&apos;s billing portal. You can
            also email {mail} and we&apos;ll cancel for you.
          </li>
          <li>
            Cancelling stops all future charges. Pro stays active until the end of the month you already paid for.
            Résumés you unlocked while subscribed stay unlocked.
          </li>
          <li>
            If we change the subscription price we&apos;ll tell you at least{" "}
            <FounderPlaceholder>notice period, e.g. 30 days</FounderPlaceholder> before it applies, and you can cancel
            before then.
          </li>
          <li>If a renewal payment fails, Stripe may retry it; if it keeps failing, the subscription ends.</li>
        </ul>
      </LegalSection>

      <LegalSection id="termination" title="8. Ending the agreement">
        <p>
          You can stop using easyCV at any time and ask us to delete your data (see the Privacy Policy). We may suspend
          or close accounts that break these terms, or stop offering easyCV with reasonable notice; if we stop the
          service we&apos;ll refund any unused prepaid subscription period.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="9. Disclaimers and liability">
        <p>
          easyCV is provided &ldquo;as is&rdquo;. To the extent the law allows, we disclaim implied warranties and are
          not liable for indirect or consequential losses, such as lost job opportunities.{" "}
          <FounderPlaceholder>liability cap and consumer-law carve-outs (legal review)</FounderPlaceholder>
        </p>
      </LegalSection>

      <LegalSection id="law" title="10. Governing law and disputes">
        <p>
          <FounderPlaceholder>governing law, venue and dispute process</FounderPlaceholder>. If you are a consumer, you
          keep the protection of the mandatory laws of the country where you live.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="11. Changes and contact">
        <p>
          We&apos;ll update the date at the top when these terms change and tell signed-in users about significant
          changes before they apply. Questions: {mail}.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
