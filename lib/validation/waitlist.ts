import { z } from "zod";

import { SIGNUP_COUNTRIES, SIGNUP_VERTICALS } from "@/lib/validation/auth-rules";

import { normalizeWhatsAppNumber } from "./app";

/** A beta waitlist request (POST /api/waitlist). Field errors are keys into `waitlist.errors`. */
export const waitlistSchema = z
  .object({
    businessName: z.string({ error: "business_name" }).trim().min(2, "business_name").max(120, "business_name"),
    // Checked here too, so a bad number is reported alongside the other fields (the country is read below).
    whatsappNumber: z
      .string({ error: "whatsapp" })
      .trim()
      .max(32, "whatsapp")
      .refine((v) => /^\+?[0-9 ()-]+$/.test(v) && v.replace(/[^0-9]/g, "").length >= 8, "whatsapp"),
    email: z.string({ error: "email" }).trim().toLowerCase().max(254, "email").pipe(z.email("email")),
    vertical: z.enum(SIGNUP_VERTICALS, { error: "vertical" }),
    country: z.enum(SIGNUP_COUNTRIES).optional().catch(undefined),
    locale: z.enum(["en", "fr"]).optional().catch(undefined),
    /** Left empty by people; bots fill it in. */
    website: z.string().max(200).optional(),
  })
  .transform((v, ctx) => {
    const whatsappNumber = normalizeWhatsAppNumber(v.whatsappNumber, v.country ?? "CM");
    if (!/^[0-9]{8,15}$/.test(whatsappNumber)) {
      ctx.addIssue({ code: "custom", path: ["whatsappNumber"], message: "whatsapp" });
      return z.NEVER;
    }
    return { ...v, whatsappNumber };
  });

export type WaitlistInput = z.input<typeof waitlistSchema>;
