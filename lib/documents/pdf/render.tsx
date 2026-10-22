import "server-only";

import path from "node:path";

import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { computeTotals } from "../calc";
import { DOCUMENT_LABELS, formatDocDate, formatDocMoney, formatQuantity, type DocumentLabels } from "../labels";
import { STAMP_COLOURS, metaRows, paidInFull, paidRows, relatedRows, stampWord } from "../layout";
import type { StatementData } from "../statement";
import type { DocumentData, DocumentTemplate, DocumentTotals } from "../types";

/*
 * The PDF engine: one renderer, three templates (classic, modern, minimal) for
 * invoices, receipts and quotations, A4. Rows never split across pages, the
 * totals stay together, and every page carries the document number and
 * "Page x of y". Used by the guest generator, the dashboard and (later) WhatsApp.
 */

const FONTS = path.join(process.cwd(), "assets", "fonts");
let fontsReady: Promise<void> | null = null;
function registerFonts() {
  fontsReady ??= loadFonts();
  return fontsReady;
}

type GlyphFont = { _glyphs?: Record<number, unknown>; getGlyph: (id: number, chars?: number[]) => unknown; __wbPatched?: boolean };
/*
 * fontkit caches glyph objects per font. When a PDF uses an accented capital
 * (É, Ê…), the subsetter fetches its component glyph (E) without characters and
 * that empty glyph stays in the cache: every later PDF from the same server
 * process then printed "EC-2026" for "REC-2026" and lost the text layer of E.
 * Glyphs fetched without characters are therefore not kept in the cache.
 */
function guardGlyphCache(font: GlyphFont) {
  if (font.__wbPatched || !font._glyphs) return;
  const original = font.getGlyph.bind(font);
  font.getGlyph = (id, chars) => {
    if ((chars && chars.length) || font._glyphs![id]) return original(id, chars);
    const glyph = original(id, chars);
    delete font._glyphs![id];
    return glyph;
  };
  font.__wbPatched = true;
}

async function loadFonts() {
  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(FONTS, "inter-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(FONTS, "inter-latin-600-normal.woff"), fontWeight: 600 },
      { src: path.join(FONTS, "inter-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.register({ family: "Jakarta", src: path.join(FONTS, "PlusJakartaSans-ExtraBold-latin.woff"), fontWeight: 800 });
  // No hyphenation; very long unbroken words (references, links) are cut so they never overflow a cell.
  Font.registerHyphenationCallback((word) => (word.length > 22 ? word.match(/.{1,16}/g) ?? [word] : [word]));
  for (const family of ["Inter", "Jakarta"]) {
    for (const source of Font.getRegisteredFonts()[family]?.sources ?? []) {
      await source.load();
      if (source.data) guardGlyphCache(source.data as unknown as GlyphFont);
    }
  }
}

export type PdfLogo = { data: Buffer; format: "png" | "jpg" } | null;
export type PdfOptions = { logo?: PdfLogo; branding?: boolean };

type Theme = {
  body: string;
  bold: string;
  boldWeight: number;
  heading: string;
  headingWeight: number;
  ink: string;
  muted: string;
  accent: string;
  accentInk: string;
  line: string;
  headFill: string;
  headInk: string;
  zebra: string | null;
};

const THEMES: Record<DocumentTemplate, Theme> = {
  classic: { body: "Times-Roman", bold: "Times-Bold", boldWeight: 400, heading: "Times-Bold", headingWeight: 400, ink: "#1f2933", muted: "#55606b", accent: "#1e3a5f", accentInk: "#ffffff", line: "#9aa5b1", headFill: "#1e3a5f", headInk: "#ffffff", zebra: null },
  modern: { body: "Inter", bold: "Inter", boldWeight: 700, heading: "Jakarta", headingWeight: 800, ink: "#102a2a", muted: "#526262", accent: "#16b878", accentInk: "#102a2a", line: "#dfe7e3", headFill: "#102a2a", headInk: "#ffffff", zebra: "#f3faf6" },
  minimal: { body: "Inter", bold: "Inter", boldWeight: 600, heading: "Inter", headingWeight: 700, ink: "#111111", muted: "#6b6b6b", accent: "#111111", accentInk: "#ffffff", line: "#e2e2e2", headFill: "#ffffff", headInk: "#6b6b6b", zebra: null },
};

function styles(th: Theme, template: DocumentTemplate) {
  return StyleSheet.create({
    page: { paddingTop: 42, paddingBottom: 64, paddingHorizontal: 42, fontFamily: th.body, fontSize: 9.5, color: th.ink },
    bold: { fontFamily: th.bold, fontWeight: th.boldWeight },
    muted: { color: th.muted },
    h: { fontFamily: th.heading, fontWeight: th.headingWeight, lineHeight: 1.15 },
    small: { fontSize: 8, color: th.muted },
    label: { fontSize: 7.5, color: th.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
    row: { flexDirection: "row" },
    cellNo: { width: 22 },
    cellDesc: { flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 8 },
    cellQty: { width: 44, textAlign: "right" },
    cellPrice: { width: 82, textAlign: "right" },
    cellDisc: { width: 46, textAlign: "right" },
    cellAmt: { width: 90, textAlign: "right" },
    footer: { position: "absolute", left: 42, right: 42, bottom: 26, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: th.muted, borderTopWidth: 0.5, borderTopColor: th.line, paddingTop: 6 },
  });
}

type S = ReturnType<typeof styles>;
type Ctx = { doc: DocumentData; L: DocumentLabels; t: DocumentTotals; th: Theme; s: S; money: (n: number) => string; logo: PdfLogo; template: DocumentTemplate };

function LogoImage({ logo, size }: { logo: PdfLogo; size: number }) {
  if (!logo) return null;
  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
  return <Image src={logo} style={{ width: size, height: size, objectFit: "contain" }} />;
}

function partyLines(p: DocumentData["business"]) {
  return [p.reference, p.address, p.phone, p.email, p.website].filter((x): x is string => !!x);
}

function Meta({ c, align = "right", dark = false }: { c: Ctx; align?: "left" | "right"; dark?: boolean }) {
  const { doc, L, s } = c;
  const rows = metaRows(doc, L);
  return (
    <View style={{ alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      {rows.map(([k, v]) => (
        <View key={k} style={[s.row, { gap: 8, marginTop: 1 }]}>
          <Text style={dark ? { color: "#9fd9c2" } : s.muted}>{k}</Text>
          <Text style={[s.bold, dark ? { color: "#ffffff" } : {}]}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

function Parties({ c }: { c: Ctx }) {
  const { doc, L, s, th } = c;
  const box = c.template === "classic" ? { borderWidth: 0.75, borderColor: th.line, padding: 10 } : c.template === "modern" ? { backgroundColor: "#f3faf6", padding: 12, borderRadius: 6 } : { paddingVertical: 4 };
  return (
    <View style={[s.row, { gap: 14, marginTop: 18 }]} wrap={false}>
      <View style={[{ flex: 1 }, box]}>
        <Text style={s.label}>{L.from}</Text>
        <Text style={s.bold}>{doc.business.name}</Text>
        {partyLines(doc.business).map((l, i) => (
          <Text key={i} style={s.muted}>{l}</Text>
        ))}
      </View>
      <View style={[{ flex: 1 }, box]}>
        <Text style={s.label}>{L.to[doc.type]}</Text>
        <Text style={s.bold}>{doc.customer.name}</Text>
        {partyLines(doc.customer).map((l, i) => (
          <Text key={i} style={s.muted}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

function Items({ c }: { c: Ctx }) {
  const { doc, L, s, th, t } = c;
  const anyDisc = doc.items.some((i) => (i.discountPercent ?? 0) > 0);
  const headBorder = c.template === "minimal" ? { borderBottomWidth: 1, borderBottomColor: th.ink } : {};
  const head = { backgroundColor: th.headFill, color: th.headInk, paddingVertical: 6, paddingHorizontal: 6, ...headBorder };
  return (
    <View style={{ marginTop: 18 }}>
      <View style={[s.row, head, { fontFamily: th.bold, fontWeight: th.boldWeight, fontSize: 8.5 }]} wrap={false}>
        <Text style={s.cellNo}>#</Text>
        <Text style={s.cellDesc}>{L.description}</Text>
        <Text style={s.cellQty}>{L.quantity}</Text>
        <Text style={s.cellPrice}>{L.unitPrice}</Text>
        {anyDisc ? <Text style={s.cellDisc}>{L.discount}</Text> : null}
        <Text style={s.cellAmt}>{L.amount}</Text>
      </View>
      {doc.items.map((it, i) => (
        <View
          key={i}
          wrap={false}
          style={[
            s.row,
            { paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: th.line },
            c.template === "classic" ? { borderLeftWidth: 0.5, borderRightWidth: 0.5, borderLeftColor: th.line, borderRightColor: th.line } : {},
            th.zebra && i % 2 === 1 ? { backgroundColor: th.zebra } : {},
          ]}
        >
          <Text style={[s.cellNo, s.muted]}>{i + 1}</Text>
          <View style={s.cellDesc}>
            <Text style={s.bold}>{it.description}</Text>
            {it.details ? <Text style={[s.muted, { fontSize: 8.5, marginTop: 1 }]}>{it.details}</Text> : null}
          </View>
          <Text style={s.cellQty}>{formatQuantity(it.quantity, doc.language)}</Text>
          <Text style={s.cellPrice}>{c.money(it.unitPrice)}</Text>
          {anyDisc ? <Text style={s.cellDisc}>{it.discountPercent ? `${formatQuantity(it.discountPercent, doc.language)} %` : ""}</Text> : null}
          <Text style={[s.cellAmt, s.bold]}>{c.money(t.lines[i].total)}</Text>
        </View>
      ))}
    </View>
  );
}

function Totals({ c }: { c: Ctx }) {
  const { doc, L, s, th, t, money } = c;
  const rows: [string, string, boolean?][] = [[L.subtotal, money(t.subtotal)]];
  if (t.discount > 0) rows.push([L.discount, `− ${money(t.discount)}`]);
  if ((doc.taxRate ?? 0) > 0) rows.push([`${doc.taxLabel || L.tax} (${formatQuantity(doc.taxRate ?? 0, doc.language)} %)`, money(t.tax)]);
  const totalBox =
    c.template === "modern"
      ? { backgroundColor: th.accent, color: th.accentInk, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10, marginTop: 6 }
      : c.template === "classic"
        ? { borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: th.accent, paddingVertical: 6, paddingHorizontal: 4, marginTop: 6 }
        : { borderTopWidth: 1, borderTopColor: th.ink, paddingVertical: 6, paddingHorizontal: 4, marginTop: 6 };
  return (
    <View wrap={false} style={[s.row, { marginTop: 14 }]}>
      <View style={{ flex: 1, paddingRight: 20 }}>
        {doc.type === "receipt" && doc.payment ? (
          <View>
            <Text style={s.label}>{L.paymentMethod}</Text>
            <Text style={s.bold}>{L.methods[doc.payment.method]}</Text>
            {doc.payment.reference ? (
              <Text style={[s.muted, { marginTop: 2 }]}>
                {L.paymentReference}: {doc.payment.reference}
              </Text>
            ) : null}
            {relatedRows(doc, L, money).map(([k, v]) => (
              <Text key={k} style={[s.muted, { marginTop: 2 }]}>
                {k}: {v}
              </Text>
            ))}
            {paidInFull(doc, t) ? (
              <Text style={[s.bold, { marginTop: 8, color: c.template === "modern" ? "#0c8354" : th.accent, fontSize: 11 }]}>{L.paidInFull}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={{ width: 230 }}>
        {rows.map(([k, v]) => (
          <View key={k} style={[s.row, { justifyContent: "space-between", paddingVertical: 2.5, paddingHorizontal: 4 }]}>
            <Text style={s.muted}>{k}</Text>
            <Text>{v}</Text>
          </View>
        ))}
        <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }, totalBox]}>
          <Text style={[s.bold, { fontSize: 11 }]}>{L.total}</Text>
          <Text style={[c.template === "modern" ? s.h : s.bold, { fontSize: 13 }]}>{money(t.total)}</Text>
        </View>
        {paidRows(doc, t, L, money).map(([k, v], i) => (
          <View key={k} style={[s.row, { justifyContent: "space-between", paddingVertical: 2.5, paddingHorizontal: 4, marginTop: i === 0 ? 4 : 0 }]}>
            <Text style={s.muted}>{k}</Text>
            <Text style={s.bold}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Closing({ c }: { c: Ctx }) {
  const { doc, L, s, th } = c;
  return (
    <>
      {doc.notes ? (
        <View style={{ marginTop: 18 }}>
          <Text style={s.label}>{L.notes}</Text>
          <Text>{doc.notes}</Text>
        </View>
      ) : null}
      {doc.terms ? (
        <View style={{ marginTop: 12 }}>
          <Text style={s.label}>{L.terms}</Text>
          <Text style={s.muted}>{doc.terms}</Text>
        </View>
      ) : null}
      <View wrap={false} style={[s.row, { marginTop: 22, justifyContent: "space-between", alignItems: "flex-end" }]}>
        <Text style={[s.bold, { color: c.template === "minimal" ? th.ink : th.accent === "#16b878" ? "#0c8354" : th.accent }]}>{L.thanks[doc.type]}</Text>
        {c.template !== "minimal" ? (
          <View style={[s.row, { gap: 16 }]}>
            {c.template === "classic" ? (
              <View style={{ width: 110, height: 60, borderWidth: 0.75, borderColor: th.line, borderStyle: "dashed", alignItems: "center", justifyContent: "flex-end", paddingBottom: 4 }}>
                <Text style={s.small}>{L.stamp}</Text>
              </View>
            ) : null}
            <View style={{ width: 150, borderTopWidth: 0.75, borderTopColor: th.ink, paddingTop: 4, alignItems: "center" }}>
              <Text style={s.small}>{L.signature}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </>
  );
}

function Header({ c }: { c: Ctx }) {
  const { doc, L, s, th, logo } = c;
  const title = L.title[doc.type];
  if (c.template === "modern") {
    return (
      <View style={{ marginHorizontal: -42, marginTop: -42, backgroundColor: th.headFill, color: "#ffffff", paddingHorizontal: 42, paddingTop: 34, paddingBottom: 22 }}>
        <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-start" }]}>
          <View style={[s.row, { gap: 12, alignItems: "center", flex: 1 }]}>
            {logo ? (
              <View style={{ backgroundColor: "#ffffff", borderRadius: 8, padding: 4 }}>
                <LogoImage logo={logo} size={46} />
              </View>
            ) : null}
            <Text style={[s.h, { fontSize: 16, color: "#ffffff", flexShrink: 1 }]}>{doc.business.name}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[s.h, { fontSize: 24, color: th.accent, textTransform: "uppercase" }]}>{title}</Text>
          </View>
        </View>
        <View style={[s.row, { justifyContent: "flex-end", marginTop: 10, color: "#d7efe4" }]}>
          <View style={{ alignItems: "flex-end" }}>
            <Meta c={c} dark />
          </View>
        </View>
      </View>
    );
  }
  if (c.template === "classic") {
    return (
      <View>
        <View style={{ alignItems: "center" }}>
          <LogoImage logo={logo} size={56} />
          <Text style={[s.h, { fontSize: 18, marginTop: logo ? 6 : 0, textAlign: "center", color: th.accent }]}>{doc.business.name}</Text>
          <Text style={[s.muted, { textAlign: "center", fontSize: 8.5 }]}>{partyLines(doc.business).join("  ·  ")}</Text>
        </View>
        <View style={{ borderTopWidth: 2, borderTopColor: th.accent, marginTop: 10 }} />
        <View style={{ borderTopWidth: 0.5, borderTopColor: th.accent, marginTop: 2 }} />
        <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-end", marginTop: 12 }]}>
          <Text style={[s.h, { fontSize: 22, letterSpacing: 2, textTransform: "uppercase" }]}>{title}</Text>
          <Meta c={c} />
        </View>
      </View>
    );
  }
  return (
    <View>
      <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-start" }]}>
        <View style={{ flex: 1 }}>
          <LogoImage logo={logo} size={40} />
          <Text style={[s.h, { fontSize: 13, marginTop: logo ? 8 : 0 }]}>{doc.business.name}</Text>
        </View>
        <Text style={[s.h, { fontSize: 28, letterSpacing: -0.5 }]}>{title}</Text>
      </View>
      <View style={[s.row, { justifyContent: "flex-end", marginTop: 8 }]}>
        <Meta c={c} />
      </View>
    </View>
  );
}

function Stamp({ c }: { c: Ctx }) {
  const word = stampWord(c.doc, c.L);
  if (!word || !c.doc.stamp) return null;
  return (
    <View fixed style={{ position: "absolute", top: 330, left: 0, right: 0, alignItems: "center" }}>
      <Text style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 84, color: STAMP_COLOURS[c.doc.stamp], opacity: 0.18, transform: "rotate(-28deg)", textTransform: "uppercase" }}>{word}</Text>
    </View>
  );
}

function DocumentPdf({ doc, logo, branding }: { doc: DocumentData; logo: PdfLogo; branding: boolean }) {
  const th = THEMES[doc.template];
  const s = styles(th, doc.template);
  const L = DOCUMENT_LABELS[doc.language];
  const t = computeTotals(doc);
  const c: Ctx = { doc, L, t, th, s, logo, template: doc.template, money: (n) => formatDocMoney(n, doc.currency, doc.language) };
  const title = `${L.title[doc.type]}${doc.number ? ` ${doc.number}` : ""}`;
  return (
    <Document title={title} author={doc.business.name} creator="WazaBolt" producer="WazaBolt" language={doc.language}>
      <Page size="A4" style={s.page}>
        <Stamp c={c} />
        <Header c={c} />
        <Parties c={c} />
        <Items c={c} />
        <Totals c={c} />
        <Closing c={c} />
        <View fixed style={s.footer}>
          <Text>{title}</Text>
          {branding ? <Text>{L.generatedWith}</Text> : null}
          <Text render={({ pageNumber, totalPages }) => `${L.page} ${pageNumber} ${L.of} ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** Renders a document to a PDF file (bytes). */
export async function renderDocumentPdf(doc: DocumentData, opts: PdfOptions = {}): Promise<Buffer> {
  await registerFonts();
  return renderToBuffer(<DocumentPdf doc={doc} logo={opts.logo ?? null} branding={opts.branding ?? true} />);
}

/** "facture-INV-2026-000001.pdf" / "receipt.pdf" — safe for Content-Disposition. */
export function pdfFileName(doc: Pick<DocumentData, "type" | "language" | "number">): string {
  const base = DOCUMENT_LABELS[doc.language].title[doc.type].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const num = doc.number ? `-${doc.number.replace(/[^A-Za-z0-9_-]/g, "")}` : "";
  return `${base}${num}.pdf`;
}

/*
 * A customer's statement of account, with the same fonts, colours and footer
 * as the documents of the chosen template.
 */
function StatementPdf({ st, logo, branding }: { st: StatementData; logo: PdfLogo; branding: boolean }) {
  const th = THEMES[st.template];
  const s = styles(th, st.template);
  const L = DOCUMENT_LABELS[st.language];
  const S = L.statement;
  const money = (n: number) => formatDocMoney(n, st.currency, st.language);
  const date = (d: string) => formatDocDate(d, st.language);
  const period = st.from ? `${date(st.from)} – ${date(st.to)}` : `${S.allTime} – ${date(st.to)}`;
  const head = { backgroundColor: th.headFill, color: th.headInk, paddingVertical: 6, paddingHorizontal: 6, ...(st.template === "minimal" ? { borderBottomWidth: 1, borderBottomColor: th.ink } : {}) };
  const cDate = { width: 64 };
  const cRef = { width: 92 };
  const cDesc = { flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 6 };
  const cAmt = { width: 74, textAlign: "right" as const };
  const box = st.template === "classic" ? { borderWidth: 0.75, borderColor: th.line, padding: 10 } : st.template === "modern" ? { backgroundColor: "#f3faf6", padding: 12, borderRadius: 6 } : { paddingVertical: 4 };
  const summary: [string, string][] = [
    ...(st.from ? [[S.opening, money(st.opening)] as [string, string]] : []),
    [S.totalCharges, money(st.totalCharges)],
    [S.totalPayments, money(st.totalPayments)],
  ];
  const footerTitle = `${S.title} · ${st.customer.name}`;
  return (
    <Document title={footerTitle} author={st.business.name} creator="WazaBolt" producer="WazaBolt" language={st.language}>
      <Page size="A4" style={s.page}>
        <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-start" }]}>
          <View style={{ flex: 1 }}>
            <LogoImage logo={logo} size={40} />
            <Text style={[s.h, { fontSize: 13, marginTop: logo ? 8 : 0, color: st.template === "classic" ? th.accent : th.ink }]}>{st.business.name}</Text>
            {partyLines(st.business).map((l, i) => (
              <Text key={i} style={s.muted}>{l}</Text>
            ))}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[s.h, { fontSize: 20, color: st.template === "modern" ? "#0c8354" : th.ink, textTransform: st.template === "classic" ? "uppercase" : "none" }]}>{S.title}</Text>
            <View style={[s.row, { gap: 8, marginTop: 6 }]}>
              <Text style={s.muted}>{S.period}</Text>
              <Text style={s.bold}>{period}</Text>
            </View>
            <View style={[s.row, { gap: 8, marginTop: 1 }]}>
              <Text style={s.muted}>{S.issued}</Text>
              <Text style={s.bold}>{date(st.issuedOn)}</Text>
            </View>
          </View>
        </View>

        <View style={[s.row, { gap: 14, marginTop: 18 }]} wrap={false}>
          <View style={[{ flex: 1 }, box]}>
            <Text style={s.label}>{S.customer}</Text>
            <Text style={s.bold}>{st.customer.name}</Text>
            {partyLines(st.customer).map((l, i) => (
              <Text key={i} style={s.muted}>{l}</Text>
            ))}
          </View>
          <View style={[{ width: 200 }, box]}>
            <Text style={s.label}>{S.closing}</Text>
            <Text style={[s.h, { fontSize: 16, color: st.closing > 0 ? "#b4412f" : th.ink }]}>{money(st.closing)}</Text>
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <View style={[s.row, head, { fontFamily: th.bold, fontWeight: th.boldWeight, fontSize: 8.5 }]} wrap={false} fixed>
            <Text style={cDate}>{S.date}</Text>
            <Text style={cRef}>{S.reference}</Text>
            <Text style={cDesc}>{S.description}</Text>
            <Text style={cAmt}>{S.charge}</Text>
            <Text style={cAmt}>{S.payment}</Text>
            <Text style={cAmt}>{S.balance}</Text>
          </View>
          {st.from ? (
            <View style={[s.row, { paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: th.line }]} wrap={false}>
              <Text style={[cDate, s.muted]}>{date(st.from)}</Text>
              <Text style={cRef} />
              <Text style={[cDesc, s.bold]}>{S.opening}</Text>
              <Text style={cAmt} />
              <Text style={cAmt} />
              <Text style={[cAmt, s.bold]}>{money(st.opening)}</Text>
            </View>
          ) : null}
          {st.lines.map((l, i) => (
            <View
              key={i}
              wrap={false}
              style={[s.row, { paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: th.line }, th.zebra && i % 2 === 1 ? { backgroundColor: th.zebra } : {}]}
            >
              <Text style={[cDate, s.muted]}>{date(l.date)}</Text>
              <Text style={[cRef, s.bold]}>{l.reference}</Text>
              <Text style={cDesc}>{l.description}</Text>
              <Text style={cAmt}>{l.charge ? money(l.charge) : ""}</Text>
              <Text style={cAmt}>{l.payment ? money(l.payment) : ""}</Text>
              <Text style={[cAmt, s.bold]}>{money(l.balance)}</Text>
            </View>
          ))}
          {!st.lines.length ? <Text style={[s.muted, { marginTop: 10 }]}>{S.empty}</Text> : null}
        </View>

        <View wrap={false} style={[s.row, { marginTop: 14, justifyContent: "flex-end" }]}>
          <View style={{ width: 240 }}>
            {summary.map(([k, v]) => (
              <View key={k} style={[s.row, { justifyContent: "space-between", paddingVertical: 2.5, paddingHorizontal: 4 }]}>
                <Text style={s.muted}>{k}</Text>
                <Text>{v}</Text>
              </View>
            ))}
            <View
              style={[
                s.row,
                { justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingVertical: 7, paddingHorizontal: 8 },
                st.template === "modern" ? { backgroundColor: th.accent, color: th.accentInk, borderRadius: 6 } : { borderTopWidth: 1.5, borderTopColor: th.accent },
              ]}
            >
              <Text style={[s.bold, { fontSize: 11 }]}>{S.closing}</Text>
              <Text style={[st.template === "modern" ? s.h : s.bold, { fontSize: 13 }]}>{money(st.closing)}</Text>
            </View>
          </View>
        </View>

        <View fixed style={s.footer}>
          <Text>{footerTitle}</Text>
          {branding ? <Text>{L.generatedWith}</Text> : null}
          <Text render={({ pageNumber, totalPages }) => `${L.page} ${pageNumber} ${L.of} ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** Renders a customer's statement of account to a PDF file (bytes). */
export async function renderStatementPdf(st: StatementData, opts: PdfOptions = {}): Promise<Buffer> {
  await registerFonts();
  return renderToBuffer(<StatementPdf st={st} logo={opts.logo ?? null} branding={opts.branding ?? true} />);
}

/** "releve-CUS-000012-2026-10-22.pdf" / "statement-…". */
export function statementFileName(st: Pick<StatementData, "language" | "to" | "customer">): string {
  const base = st.language === "fr" ? "releve" : "statement";
  const ref = (st.customer.reference ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  return `${base}${ref ? `-${ref}` : ""}-${st.to}.pdf`;
}
