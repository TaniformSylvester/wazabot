import "server-only";

import { cookies } from "next/headers";

import { ACTIVE_BUSINESS_COOKIE } from "@/lib/auth/dal";

const ACTIVE_BUSINESS_MAX_AGE = 60 * 60 * 24 * 365;

/** Remember the business the user works in (only a preference: membership is checked on every read). */
export async function setActiveBusiness(businessId: string) {
  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: ACTIVE_BUSINESS_MAX_AGE });
}
