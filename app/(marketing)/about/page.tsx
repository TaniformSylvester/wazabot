import type { Metadata } from "next";

import { ComingSoon } from "@/components/marketing/coming-soon";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return <ComingSoon title="About" note="This page is being written and will be published before launch." />;
}
