import { DashboardMock } from "@/components/marketing/dashboard-mock";
import { Highlight, SectionHeading } from "@/components/marketing/section-heading";

export function DashboardPreview() {
  return (
    <section aria-labelledby="dashboard-title" className="py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          id="dashboard-title"
          eyebrow="Your dashboard"
          title={
            <>
              Not just a chatbot. <Highlight>A front desk you can manage.</Highlight>
            </>
          }
          description="See every conversation, customer and order in one place — from your laptop or your phone. When WazaBot hands a chat to you, you'll know straight away."
        />
        <div className="relative mt-14">
          <div
            aria-hidden
            className="absolute inset-x-10 bottom-8 top-10 -z-10 rounded-[3rem] bg-gradient-to-r from-waza-200/60 via-gold-100 to-coral-100/70 blur-2xl"
          />
          <DashboardMock />
          <p className="mt-4 text-center text-xs text-slate-waza">Dashboard preview with example data.</p>
        </div>
      </div>
    </section>
  );
}
