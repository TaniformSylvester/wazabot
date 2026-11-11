import type { Messages } from "@/messages/en";

type B = Messages["dashboard"]["business"];

/** The business profile wording, in school terms for a school ("School name", "School email"…). */
export function businessProfileText(t: B, school: boolean): B {
  if (!school) return t;
  return { ...t, title: t.school.title, description: t.school.description, fields: { ...t.fields, ...t.school.fields } };
}
