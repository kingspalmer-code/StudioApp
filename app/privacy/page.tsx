import type { Metadata } from "next";
import Link from "next/link";
import OatcakeLogo from "@/components/OatcakeLogo";

export const metadata: Metadata = { title: "Privacy · Oatcake" };

// Who to write to about privacy. Public on the page.
const CONTACT = "CONTACT_EMAIL";
const UPDATED = "21 October 2026";

// Public: linked from the sign-in page and given to Google for the Gmail sending review.
export default function PrivacyPage() {
  return (
    <main className="legal">
      <div className="login-logo"><Link href="/login" aria-label="Oatcake"><OatcakeLogo height={30} /></Link></div>
      <h1 className="large">Privacy</h1>
      <p className="when">Last updated {UPDATED}</p>

      <p>
        Oatcake is a job tracker for small creative businesses and the people they work for. Businesses use it to take in
        requests, plan and track work, share drafts, and send quotes and invoices. This page explains what Oatcake keeps,
        why, and who else is involved in running it.
      </p>

      <h2>What Oatcake keeps</h2>
      <ul>
        <li><b>Your account:</b> your email address, name, password (stored hashed by our sign-in provider) and profile photo if you add one.</li>
        <li><b>Your work:</b> the jobs, customers, notes, files, drafts, to-dos, logged hours, quotes and invoices that you or your business add.</li>
        <li><b>Usage stats:</b> which pages and features are used and for how long, so we can see what helps and what doesn&apos;t. You can turn this off in Account.</li>
        <li><b>Help messages:</b> anything you send through Help in the app, and our replies.</li>
        <li><b>Phone alerts:</b> if you turn on push notifications, the address your browser gives us for sending them.</li>
      </ul>
      <p>We don&apos;t sell your information, show adverts, or share it with anyone except the services below that run Oatcake.</p>

      <h2>Sending from your Gmail</h2>
      <p>
        A business can connect a Gmail account in Settings &gt; Quotes &amp; invoices so that quotes and invoices it sends from
        Oatcake come from its own address. When you connect, Google asks you to allow one permission:
        <b> send email on your behalf</b> (<code>gmail.send</code>). We also receive your Google email address, so we can show which account is connected.
      </p>
      <ul>
        <li>Oatcake only sends an email when you press Send on a quote or invoice, to the address you type, with that document attached.</li>
        <li>Oatcake can&apos;t read, search, delete or change anything in your mailbox, and never asks to.</li>
        <li>We keep only the sign-in token Google gives us, encrypted, so that Send keeps working. Nobody at Oatcake reads it.</li>
        <li>Disconnect any time in Settings &gt; Quotes &amp; invoices, which deletes the token and tells Google, or remove Oatcake at myaccount.google.com/permissions.</li>
      </ul>
      <p>
        Oatcake&apos;s use and transfer of information received from Google APIs follows the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>,
        including the Limited Use requirements. Gmail data is used only to send the emails you ask Oatcake to send. It isn&apos;t used for
        adverts, isn&apos;t sold, isn&apos;t used to train AI models, and isn&apos;t read by people.
      </p>

      <h2>Services that run Oatcake</h2>
      <ul>
        <li><b>Supabase</b> stores accounts, data and files, in Ireland (EU).</li>
        <li><b>Vercel</b> hosts the website. The servers that handle your data run in Ireland (EU).</li>
        <li><b>Resend</b> sends sign-in emails and alerts, and quotes and invoices when no Gmail is connected.</li>
        <li><b>Anthropic</b> (Claude) powers the AI features, such as the setup helper, drafting quote lines, Ask Oatcake and job time estimates. Only what you give that feature is sent, and Anthropic doesn&apos;t train on it.</li>
        <li><b>Google</b>, only if you connect Gmail.</li>
        <li><b>Apple, Google and Mozilla push services</b> deliver phone and browser alerts if you turn them on.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Your data stays while your account or business uses Oatcake. Ask us to delete your account and we&apos;ll remove it and
        the data only you can see. Work that belongs to a business (its jobs, files and documents) stays with that business.
      </p>

      <h2>Your rights</h2>
      <p>
        You can see and change most of your information in the app. You can also ask us for a copy, ask us to correct or delete it,
        or object to how it&apos;s used, by emailing <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. If you&apos;re in the UK you can also
        complain to the Information Commissioner&apos;s Office (ico.org.uk).
      </p>

      <h2>Changes</h2>
      <p>If this changes in a way that matters, we&apos;ll update the date above and tell you in the app.</p>

      <p className="foot" style={{ marginTop: 32 }}><Link href="/login">‹ Back to Oatcake</Link></p>
    </main>
  );
}
