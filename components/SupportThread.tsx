import type { SupportMessage } from "@/lib/support";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Europe/London" });

// A help conversation as chat bubbles. Your own messages sit on the right.
export default function SupportThread({ messages, urls, mine }: { messages: SupportMessage[]; urls: Record<string, string>; mine: "user" | "oatcake" }) {
  return (
    <div className="chat">
      {messages.map((m) => {
        const own = m.from_oatcake === (mine === "oatcake");
        return (
          <div key={m.id} className={`bubble-row${own ? " own" : ""}`}>
            <div className="bubble">
              {m.body && <div className="copy">{m.body}</div>}
              {m.attachment && urls[m.attachment] && (
                <a href={urls[m.attachment]} target="_blank" rel="noreferrer" className="bubble-shot">
                  <img src={urls[m.attachment]} alt="Screenshot" />
                </a>
              )}
            </div>
            <span className="when">{own ? "You" : m.from_oatcake ? "Oatcake" : m.author_name || "They"} · {when(m.created_at)}</span>
          </div>
        );
      })}
    </div>
  );
}
