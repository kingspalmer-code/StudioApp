import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import RequestLinkForm from "./RequestLinkForm";
import type { LinkForm } from "./actions";

export const metadata: Metadata = { robots: { index: false } };

// A workspace's public request link: anyone can ask for a job here, no sign-up.
export default async function RequestLinkPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ n?: string; e?: string }> }) {
  const { slug } = await params;
  const { n = "", e = "" } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("request_form", { slug });
  const form = data as LinkForm | null;

  if (!form)
    return (
      <main className="auth public-page">
        <h1 className="large">Not taking requests</h1>
        <p className="sub">This request link is switched off at the moment. Get in touch with them directly instead.</p>
      </main>
    );

  return (
    <main className="public-page">
      <p className="eyebrow">{form.name}</p>
      <h1 className="large">Ask for a job</h1>
      <p className="sub">Tell {form.name} what you need. They&apos;ll get back to you, and you&apos;ll get an email with a link to follow it.</p>
      <RequestLinkForm slug={slug} form={form} name={n} email={e} />
      <p className="foot public-foot">Sent with Oatcake</p>
    </main>
  );
}
