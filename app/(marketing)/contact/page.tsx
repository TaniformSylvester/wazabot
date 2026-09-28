import type { Metadata } from "next";

import { ComingSoon } from "@/components/marketing/coming-soon";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return <ComingSoon title="Contact" note="This page is being written and will be published before launch." />;
}
