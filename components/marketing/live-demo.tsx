import { LiveDemoClient } from "@/components/marketing/live-demo-client";
import { Highlight, SectionHeading } from "@/components/marketing/section-heading";
import { getMessages } from "@/lib/i18n/dictionaries";
import { rich } from "@/lib/i18n/rich";

/**
 * UI MOCKUP — a scripted, illustrative conversation (see live-demo-client.tsx).
 * It does not call the AI. The script is in the visitor's language.
 */
export async function LiveDemo() {
  const t = await getMessages();
  const d = t.liveDemo;
  return (
    <LiveDemoClient
      t={d}
      aiLabel={t.common.status.wazaboltAi}
      heading={
        <SectionHeading
          align="left"
          id="demo-title"
          eyebrow={d.eyebrow}
          title={rich(d.title, { hl: (c) => <Highlight>{c}</Highlight> })}
          description={d.description}
        />
      }
    />
  );
}
