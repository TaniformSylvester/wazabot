import { SectionHeading } from "@/components/marketing/section-heading";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getMessages } from "@/lib/i18n/dictionaries";

export async function Faq() {
  const t = (await getMessages()).faq;
  return (
    <section id="faq" aria-labelledby="faq-title" className="py-20 sm:py-28">
      <div className="container-page max-w-3xl">
        <SectionHeading id="faq-title" eyebrow={t.eyebrow} title={t.title} />
        <Accordion type="single" collapsible className="mt-12 flex flex-col gap-3">
          {t.items.map((f, i) => (
            <AccordionItem key={f.q} value={`item-${i}`}>
              <AccordionTrigger>{f.q}</AccordionTrigger>
              <AccordionContent>{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
