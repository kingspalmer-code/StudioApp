import { Document, Font, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { docNumber, FONTS, gbp, KIND_LABEL, longDate, type Doc, type DocSettings } from "./documents";

// Renders a quote or invoice as an A4 PDF. Headings use the workspace's chosen font and colour;
// body text stays Helvetica so it reads cleanly at small sizes.
const registered = new Set<string>();
function headingFamily(settings: DocSettings, origin: string, customFontUrl: string | null) {
  if (settings.font === "custom" && customFontUrl) {
    const family = `custom-${settings.font_path}`;
    if (!registered.has(family)) {
      Font.register({ family, src: customFontUrl });
      registered.add(family);
    }
    return family;
  }
  const f = FONTS.find((x) => x.key === settings.font) ?? FONTS[0];
  if (f.file && !registered.has(f.family)) {
    Font.register({ family: f.family, src: `${origin}/pdf-fonts/${f.file}` });
    registered.add(f.family);
  }
  return f.family;
}
Font.registerHyphenationCallback((word) => [word]);

const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, ""));

export async function renderDocPdf(opts: {
  doc: Doc;
  settings: DocSettings;
  origin: string;
  logoUrl: string | null;
  customFontUrl: string | null;
}) {
  const { doc, settings: s, origin, logoUrl, customFontUrl } = opts;
  const head = headingFamily(s, origin, customFontUrl);
  const accent = /^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : "#382a25";
  const quote = doc.kind === "quote";
  const from = [s.address, s.email, s.phone, s.website].filter(Boolean);
  const to = [doc.customer_address, doc.customer_email].filter(Boolean);

  const st = StyleSheet.create({
    page: { padding: 44, paddingBottom: 64, fontFamily: "Helvetica", fontSize: 10, color: "#2a201c", lineHeight: 1.4 },
    top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
    logo: { maxHeight: 60, maxWidth: 180, objectFit: "contain" },
    brand: { fontFamily: head, fontSize: 20, lineHeight: 1.25, color: "#2a201c" },
    kind: { fontFamily: head, fontSize: 28, lineHeight: 1.25, color: accent, textAlign: "right", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 },
    right: { alignItems: "flex-end" },
    meta: { textAlign: "right", color: "#6b5d55", marginTop: 4 },
    cols: { flexDirection: "row", gap: 24, marginBottom: 22 },
    col: { flex: 1 },
    label: { fontSize: 8, color: "#8a7c74", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
    strong: { fontFamily: "Helvetica-Bold" },
    title: { fontFamily: head, fontSize: 14, lineHeight: 1.3, marginBottom: 12 },
    th: { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: accent, paddingBottom: 5, marginBottom: 2 },
    tr: { flexDirection: "row", paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: "#e6ddd2" },
    cDesc: { flex: 1, paddingRight: 10 },
    cQty: { width: 44, textAlign: "right" },
    cPrice: { width: 74, textAlign: "right" },
    cAmt: { width: 80, textAlign: "right" },
    thText: { fontSize: 8, color: "#8a7c74", textTransform: "uppercase", letterSpacing: 0.8 },
    totals: { alignSelf: "flex-end", width: 230, marginTop: 12 },
    tRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
    tTotal: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 8, borderTopWidth: 1.5, borderTopColor: accent },
    tTotalText: { fontFamily: head, fontSize: 15, lineHeight: 1.3, color: accent },
    box: { marginTop: 24, padding: 12, borderRadius: 6, backgroundColor: "#f6f1ea" },
    notes: { marginTop: 22 },
    footer: { position: "absolute", left: 44, right: 44, bottom: 28, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#9a8d85" },
  });

  const pdf = (
    <Document title={`${KIND_LABEL[doc.kind]} ${docNumber(doc)}`} author={s.business_name}>
      <Page size="A4" style={st.page}>
        <View style={st.top}>
          <View>
            {logoUrl ? <Image src={logoUrl} style={st.logo} /> : <Text style={st.brand}>{s.business_name || " "}</Text>}
          </View>
          <View style={st.right}>
            <Text style={st.kind}>{KIND_LABEL[doc.kind]}</Text>
            <Text style={st.meta}>{docNumber(doc)}</Text>
            <Text style={st.meta}>{longDate(doc.issued_on)}</Text>
          </View>
        </View>

        <View style={st.cols}>
          <View style={st.col}>
            <Text style={st.label}>From</Text>
            <Text style={st.strong}>{s.business_name}</Text>
            {from.map((l, i) => <Text key={i}>{l}</Text>)}
            {s.vat_registered && s.vat_number ? <Text>VAT no. {s.vat_number}</Text> : null}
          </View>
          <View style={st.col}>
            <Text style={st.label}>{quote ? "Prepared for" : "Bill to"}</Text>
            <Text style={st.strong}>{doc.customer_name}</Text>
            {to.map((l, i) => <Text key={i}>{l}</Text>)}
          </View>
          <View style={[st.col, { flex: 0.8 }]}>
            <Text style={st.label}>{quote ? "Valid until" : "Payment due"}</Text>
            <Text style={st.strong}>{longDate(doc.due_on) || "On receipt"}</Text>
          </View>
        </View>

        {doc.title ? <Text style={st.title}>{doc.title}</Text> : null}

        <View style={st.th}>
          <Text style={[st.cDesc, st.thText]}>Description</Text>
          <Text style={[st.cQty, st.thText]}>Qty</Text>
          <Text style={[st.cPrice, st.thText]}>Price</Text>
          <Text style={[st.cAmt, st.thText]}>Amount</Text>
        </View>
        {doc.items.map((it, i) => (
          <View style={st.tr} key={i} wrap={false}>
            <Text style={st.cDesc}>{it.description}</Text>
            <Text style={st.cQty}>{qtyText(it.qty)}</Text>
            <Text style={st.cPrice}>{gbp(it.unit_price)}</Text>
            <Text style={st.cAmt}>{gbp(Math.round(it.qty * it.unit_price * 100) / 100)}</Text>
          </View>
        ))}

        <View style={st.totals} wrap={false}>
          {doc.vat_rate != null && (
            <>
              <View style={st.tRow}><Text>Subtotal</Text><Text>{gbp(doc.subtotal)}</Text></View>
              <View style={st.tRow}><Text>VAT at {Number(doc.vat_rate)}%</Text><Text>{gbp(doc.vat)}</Text></View>
            </>
          )}
          <View style={st.tTotal}>
            <Text style={st.tTotalText}>{quote ? "Total" : "Amount due"}</Text>
            <Text style={st.tTotalText}>{gbp(doc.total)}</Text>
          </View>
        </View>

        {doc.notes ? (
          <View style={st.notes} wrap={false}>
            <Text style={st.label}>Notes</Text>
            <Text>{doc.notes}</Text>
          </View>
        ) : null}

        {!quote && s.bank_details ? (
          <View style={st.box} wrap={false}>
            <Text style={st.label}>How to pay</Text>
            <Text>{s.bank_details}</Text>
            <Text style={{ marginTop: 4 }}>Please use {docNumber(doc)} as the reference.</Text>
          </View>
        ) : null}

        <View style={st.footer} fixed>
          <Text>{s.footer || s.business_name}</Text>
          <Text render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : "")} />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(pdf);
}
