import { DashboardMock } from "@/components/marketing/dashboard-mock";
import { Reveal } from "@/components/motion/reveal";
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
              Not just a chatbot. <Highlight>Your whole WhatsApp business.</Highlight>
            </>
          }
          description="Conversations, customers, orders and performance in one place — from your laptop or your phone. When automation hands a chat to you, you'll know straight away."
        />
        <Reveal className="relative mt-14">
          <div
            aria-hidden
            className="bg-bolt-gradient absolute inset-x-12 bottom-10 top-12 -z-10 rounded-[3rem] opacity-40 blur-3xl"
          />
          <DashboardMock />
          <p className="mt-4 text-center text-xs text-stone">Dashboard preview with example data.</p>
        </Reveal>
      </div>
    </section>
  );
}
