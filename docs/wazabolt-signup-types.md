# Business type at sign-up, and setup per type (26 October 2026)

Owner decision: ask the type of business on the sign-up form, and make the guided setup match it.

## Sign-up

- **Type of business.** The sign-up form asks for the type, with four choices: **Shop, School, Restaurant, Other**. It's required, in English and French, with the hint "You can change it later in Settings".
- **Pre-selection from the marketing pages.** Coming from a landing page pre-selects the matching type. For example, "Start free" on `/solutions/schools` opens `/register?type=schools`. The page accepts the type itself or the page slug: `retail`, `school`, `restaurant`, `other`, `schools`, `restaurants`, `shop`, `shops`.
- **When the type is saved.** The type is kept in the new user's sign-up data. It's set on the business when the email link is confirmed (`app/auth/confirm`). There's no database migration: the sign-up trigger is unchanged.
  - Only the owner's business is updated.
  - Only when the business has no type yet, so a type chosen later in Settings is never overwritten.
  - An error is logged, never shown. The type can still be chosen in setup step 1.
- **Invitations.** Sign-up from an invitation is unchanged; the person joins an existing business.

## Setup per type

The steps follow the business's modules.

| Type | Steps |
|---|---|
| Shop / Other | Business information → Opening hours → Products → FAQs → AI → WhatsApp (unchanged) |
| Restaurant | Business information → Opening hours → **Your menu** (dishes and prices) → **Your tables** (add tables right there) → FAQs → AI → WhatsApp |
| School | Business information → **Your school** → FAQs → AI → WhatsApp |

- **"Your school" step.** It uses the same checklist as the School overview: school settings, school year and terms, subjects, classes, students. Each item is ticked when done and has an **Open** link to its page.
- **Start of setup.** The dashboard now sends a new owner to setup *before* sending a school to its School overview. Before, a new school skipped setup altogether. After the last step, a school lands on the School overview.
- **Changing the type.** If the owner changes the type in step 1, the next steps follow the new type.

## Tests

- **New suite `signup` (`npm run test:e2e:signup`), 15 checks:**
  - the schools page link carries the type;
  - School is pre-selected;
  - the type is set only once the email is confirmed;
  - the school setup runs in 5 steps, shows the school menu and the school checklist, and ends on the School overview;
  - in French, sign-up without a type is refused with a message;
  - the restaurant setup runs in 7 steps, step 3 is the menu, and a table is added in step 4.
- **Other suites.** Every suite that signs up now picks "Shop", so their flows are unchanged. The `auth` suite also checks the "Choose the type of business" message.
