import type { Metadata } from "next";

import { ComingSoon } from "@/components/marketing/coming-soon";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return <ComingSoon title="Privacy Policy" note="This page is being written and will be published before launch." />;
}
