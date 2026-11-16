import { isPlatformAdmin } from "@/lib/admin/access";
import { adminVertical, listWaitlistLeads } from "@/lib/admin/waitlist";
import { getCurrentUser } from "@/lib/auth/dal";
import { toCsv } from "@/lib/reports/csv";
import { createAdminClient } from "@/lib/supabase/admin";

/** CSV of the beta waitlist (all, or ?vertical=shop|restaurant|school). WazaBolt team only; anyone else gets a 404. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  const admin = createAdminClient();
  if (!user || !admin || !(await isPlatformAdmin(admin, user.id))) return new Response("Not found", { status: 404 });
  const vertical = adminVertical(new URL(request.url).searchParams.get("vertical"));
  const leads = await listWaitlistLeads(admin, vertical);
  const csv = toCsv(
    ["Joined (UTC)", "Business", "Type", "WhatsApp (with country code)", "Email", "Country", "Language", "Beta invite sent (UTC)", "Account created (UTC)"],
    leads.map((l) => [
      l.created_at.slice(0, 16).replace("T", " "),
      l.business_name,
      l.vertical,
      l.whatsapp_number,
      l.email,
      l.country_code,
      l.locale,
      l.invited_at?.slice(0, 16).replace("T", " "),
      l.joined_at?.slice(0, 16).replace("T", " "),
    ]),
  );
  const name = `wazabolt-waitlist${vertical ? `-${vertical}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
