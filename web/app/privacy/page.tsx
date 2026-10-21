import type { Metadata } from "next";
import Link from "next/link";

import { FounderPlaceholder } from "@/components/FounderPlaceholder";
import { LegalPage, LegalSection, LegalTable } from "@/components/LegalPage";
import { PrivacyChoicesButton } from "@/components/PrivacyChoicesButton";
import { PRIVACY_EMAIL, STORAGE_ENTRIES, SUBPROCESSORS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy | easyCV",
  description: "What easyCV collects, why, who processes it, how long we keep it, and your choices.",
};

const mail = (
  <a className="underline underline-offset-2" href={`mailto:${PRIVACY_EMAIL}`}>
    {PRIVACY_EMAIL}
  </a>
);

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This policy explains, in plain language, what easyCV collects when you use it, why, who helps us process it,
          how long we keep it, and what you can do about it. easyCV is operated by{" "}
          <FounderPlaceholder>legal entity name and postal address</FounderPlaceholder> (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;). Questions or requests: {mail}.
        </p>
      }
    >
      <LegalSection id="summary" title="The short version">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>We keep the résumés you upload, and what we extract from them, in your account until you delete them or ask us to. Nothing is deleted automatically today.</li>
          <li>We use AI to build and analyse your résumé. Job matching sends your résumé content (not your email, phone or address) to OpenAI in the US.</li>
          <li>We don&apos;t sell your data and don&apos;t use advertising trackers.</li>
          <li>Analytics are off unless you turn them on. We honour Global Privacy Control and Do Not Track.</li>
          <li>Email {mail} to get a copy of your data or have it deleted.</li>
        </ul>
      </LegalSection>

      <LegalSection id="collect" title="What we collect">
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Account details.</strong> When you sign in with Seridian Auth we receive your email address and an account identifier.</li>
          <li><strong>Files and text you give us.</strong> The résumé files you upload (PDF, TXT, Markdown), job descriptions or links you paste, and edits you make.</li>
          <li><strong>What we generate.</strong> The structured profile extracted from your files (which can include your name, contact details, work history, education and skills), quality scores, AI suggestions, job-match results and generated PDFs.</li>
          <li><strong>Usage of paid and limited features.</strong> How many free Auto-Improve passes you&apos;ve used, and your purchases and subscription status.</li>
          <li><strong>Help-assistant questions.</strong> Questions you type into the in-app help assistant, the answer shown, and whether you rated it helpful.</li>
          <li><strong>Payment information.</strong> Stripe collects your card details directly; we never see or store your full card number. We receive a Stripe customer id, the amount, currency and payment or subscription status.</li>
          <li><strong>Technical data.</strong> Our hosting provider processes standard request data such as IP address and browser user agent. Our monitoring records server request timings and errors without identifying you.</li>
          <li><strong>Analytics (only if you opt in).</strong> A random id, pages viewed, actions such as uploads and checkouts (counts, file types and sizes, not file contents), performance metrics, browser errors and coarse browser details (browser, OS, screen size).</li>
        </ul>
      </LegalSection>

      <LegalSection id="use" title="Why we use it">
        <LegalTable
          caption="Purposes and legal bases"
          headers={["Purpose", "Data used", "Legal basis (where GDPR / UK GDPR applies)"]}
          rows={[
            ["Provide the service: store your files, build your résumé, run AI features, let you download it", "Account details, files, generated content", "Performing our contract with you"],
            ["Take payments and manage subscriptions", "Account email, payment information", "Contract; legal obligations (tax and accounting records)"],
            ["Keep easyCV secure and prevent abuse (e.g. rate limits, fraud checks)", "Account details, technical data, feature usage", "Legitimate interests in running a safe service"],
            ["Fix errors and keep the service fast", "Server request timings and errors (no visitor id)", "Legitimate interests"],
            ["Understand how easyCV is used and improve it", "Analytics data", "Your consent (you can withdraw it any time)"],
            ["Answer support and privacy requests", "Whatever you send us", "Contract; legal obligations"],
          ]}
        />
        <p>We do not use your files or résumé to train AI models, and we do not make decisions about you that have legal or similarly significant effects based solely on automated processing.</p>
      </LegalSection>

      <LegalSection id="ai" title="AI processing and accuracy">
        <p>
          easyCV uses AI models to combine your uploaded files into one résumé, suggest improvements, and compare your
          résumé with job descriptions. For job matching we send your name and résumé sections (summary, experience,
          education, skills, certifications) plus the job description to OpenAI&apos;s API in the United States. We
          leave out your email, phone number and address. Résumé consolidation also uses an AI model; when it runs on
          a hosted provider, that provider is listed below.
        </p>
        <p>
          OpenAI states that data sent through its API is not used to train its models by default and may be kept for
          up to 30 days for abuse monitoring. <FounderPlaceholder>confirm the OpenAI data-retention settings on our account</FounderPlaceholder>
        </p>
        <p>
          <strong>AI output can be wrong.</strong> It may misread your files, omit or invent details, or give poor
          suggestions. Scores and match results are estimates, not predictions of how an employer or applicant
          tracking system will treat you. Always review your résumé before you send it.
        </p>
      </LegalSection>

      <LegalSection id="subprocessors" title="Who we share it with">
        <p>
          We share data only with the service providers below, only for the purposes listed, and under contracts that
          limit their use of it. We may also disclose data if required by law or to protect our rights, or to a buyer
          if the business is sold (we would tell you first). We do not sell or &ldquo;share&rdquo; personal information
          for cross-context behavioural advertising.
        </p>
        <LegalTable
          caption="Subprocessors"
          headers={["Provider", "What for", "Data", "Location"]}
          rows={SUBPROCESSORS.map((p) => [p.name, p.purpose, p.data, p.location])}
        />
        <p>
          We don&apos;t currently send email from easyCV; sign-in emails, if any, come from Seridian Auth. We&apos;ll
          update this list before adding a provider.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="How long we keep it">
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Your files, extracted profile, generated résumés and job-match results:</strong> until you delete them or ask us to. There is no automatic deletion today.</li>
          <li><strong>Account details:</strong> until you ask us to delete your account.</li>
          <li><strong>Payment records:</strong> as long as tax and accounting law requires. <FounderPlaceholder>retention period, e.g. 7 years</FounderPlaceholder></li>
          <li><strong>Analytics and monitoring data:</strong> <FounderPlaceholder>retention period in the monitoring service</FounderPlaceholder></li>
          <li><strong>Data held by providers</strong> (e.g. hosting logs, OpenAI abuse monitoring) is kept under their own retention policies.</li>
        </ul>
      </LegalSection>

      <LegalSection id="rights" title="Your rights and choices">
        <p>Depending on where you live, you can ask us to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>give you a copy of your data, including an export of your files and résumé;</li>
          <li>correct it (you can also edit your résumé in the app);</li>
          <li>delete your files, résumés or your whole account;</li>
          <li>stop or restrict certain processing, or object to it;</li>
          <li>withdraw consent to analytics at any time (use <PrivacyChoicesButton />).</li>
        </ul>
        <p>
          Email {mail} from the address you sign in with. We&apos;ll confirm it&apos;s you and reply within 30 days.
          We won&apos;t treat you differently for using these rights. You can also complain to your local data
          protection authority.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies and browser storage">
        <p>
          Essential cookies are always on because sign-in and your settings don&apos;t work without them. Analytics
          storage is only created after you choose &ldquo;Accept analytics&rdquo;, and is deleted if you later choose
          &ldquo;Essential only&rdquo;. If your browser sends Global Privacy Control or Do Not Track, analytics stays off.
          We don&apos;t use advertising cookies or device fingerprinting.
        </p>
        <LegalTable
          caption="Cookies and browser storage"
          headers={["Name", "Type", "Category", "Purpose", "Duration"]}
          rows={STORAGE_ENTRIES.map((e) => [
            <code key="n" className="break-all">{e.name}</code>,
            e.kind === "cookie" ? "Cookie" : "Local storage",
            e.category === "essential" ? "Essential" : "Analytics (opt-in)",
            e.purpose,
            e.duration,
          ])}
        />
        <p>Change your choice any time: <PrivacyChoicesButton />.</p>
      </LegalSection>

      <LegalSection id="security" title="Security">
        <p>
          Data is encrypted in transit (HTTPS). Your sign-in session is stored in an encrypted, HttpOnly cookie, and
          each account can only access its own uploads. No system is perfectly secure; if a breach affects your data we
          will tell you as the law requires.
        </p>
      </LegalSection>

      <LegalSection id="transfers" title="Where your data is processed">
        <p>
          easyCV and its providers process data in the United States. If you are outside the US, your data is
          transferred there. <FounderPlaceholder>transfer mechanism for EU/UK users, e.g. Standard Contractual Clauses / Data Privacy Framework</FounderPlaceholder>
        </p>
      </LegalSection>

      <LegalSection id="children" title="Children">
        <p>easyCV is not for anyone under 16. We don&apos;t knowingly collect data from children; if you think we have, email {mail} and we&apos;ll delete it.</p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to this policy">
        <p>
          We&apos;ll update the date at the top when this policy changes, and tell signed-in users about significant
          changes before they take effect. See also our <Link className="underline underline-offset-2" href="/terms">Terms of Service</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
