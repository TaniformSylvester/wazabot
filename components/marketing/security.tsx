import { BookOpenCheck, Building2, Hand, KeyRound, LockKeyhole } from "lucide-react";

import { Highlight, SectionHeading } from "@/components/marketing/section-heading";

const points = [
  { icon: LockKeyhole, title: "Secure authentication", text: "Dashboard sign-in with secure sessions. Only your team can get in." },
  { icon: Building2, title: "Tenant-isolated data", text: "Every record is tied to your business. Other businesses can't see your data." },
  { icon: KeyRound, title: "Protected API credentials", text: "WhatsApp and AI keys stay on our servers — never in the browser or in logs." },
  { icon: Hand, title: "Human control", text: "You decide when WazaBot answers. Take over, pause or hand back in one tap." },
  { icon: BookOpenCheck, title: "Business-specific knowledge", text: "WazaBot answers from your information only, and says so when it doesn't know." },
];

export function Security() {
  return (
    <section aria-labelledby="security-title" className="bg-white py-20 sm:py-28">
      <div className="container-page grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <SectionHeading
          align="left"
          id="security-title"
          eyebrow="Trust"
          title={
            <>
              Your business information <Highlight>belongs to you.</Highlight>
            </>
          }
          description="Your customers trust you with their messages. We built WazaBot so you stay in control of that trust."
        />
        <ul className="grid gap-4 sm:grid-cols-2">
          {points.map(({ icon: Icon, title, text }, i) => (
            <li
              key={title}
              className={`flex gap-4 rounded-2xl border border-border bg-cream p-5 ${i === points.length - 1 ? "sm:col-span-2" : ""}`}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-deep text-waza-300">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <h3 className="text-base font-bold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-waza">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
