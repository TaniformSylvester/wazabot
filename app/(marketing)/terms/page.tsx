import type { Metadata } from "next";

import { ComingSoon } from "@/components/marketing/coming-soon";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return <ComingSoon title="Terms of Service" note="This page is being written and will be published before launch." />;
}
