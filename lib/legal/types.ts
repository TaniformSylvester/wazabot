/*
 * Legal pages (Privacy Policy, Terms of Service) as structured text, so both
 * languages share one layout. Placeholders filled at render time:
 *   {operator}  who runs WazaBolt (config/site.ts → legal), {email}, {phone},
 *   {address}, {site}
 */

/** A paragraph, or a bulleted list. */
export type LegalBlock = string | { list: string[] };

export type LegalDoc = {
  title: string;
  eyebrow: string;
  updatedLabel: string;
  intro: string[];
  tocLabel: string;
  sections: { id: string; heading: string; body: LegalBlock[] }[];
};
