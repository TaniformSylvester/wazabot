/** One <script type="application/ld+json"> with a schema.org @graph (escaped so it can't close the script tag). */
export function JsonLd({ graph }: { graph: object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c") }} />;
}
