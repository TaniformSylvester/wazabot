import type { Messages } from "@/messages/en";

type C = Messages["dashboard"]["customers"];

/** The customer wording, in parent terms for a school (Parent ID, "the parent"…). */
export function parentText(c: C, school: boolean): C {
  if (!school) return c;
  const p = c.school.page;
  return {
    ...c,
    unnamed: p.unnamed,
    created: p.created,
    copyReference: p.copyReference,
    deleteBlocked: p.deleteBlocked,
    summary: { ...c.summary, since: p.since },
    fields: { ...c.fields, phoneLocked: p.phoneLocked, tagsHint: p.tagsHint, marketing: p.marketing, marketingText: p.marketingText },
    profile: { ...c.profile, reference: c.school.reference, possibleDuplicatesText: p.possibleDuplicatesText, languageSource: p.languageSource },
  };
}
