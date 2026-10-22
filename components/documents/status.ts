import type { BadgeTone } from "@/components/app/ui";
import type { DocumentStatus } from "@/lib/documents/types";

/** Badge colour per document status (shown status: overdue invoices and expired quotations included). */
export const documentStatusTone: Record<DocumentStatus | "overdue" | "expired", BadgeTone> = {
  draft: "neutral",
  issued: "blue",
  sent: "blue",
  accepted: "green",
  rejected: "red",
  partially_paid: "amber",
  paid: "green",
  voided: "dark",
  overdue: "red",
  expired: "amber",
};
