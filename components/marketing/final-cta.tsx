import Link from "next/link";
import { Zap } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="py-20 sm:py-28">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-ink px-6 py-16 text-center sm:px-12 sm:py-20">
          <div
            aria-hidden
            className="absolute inset-0 animate-gradient bg-[length:200%_200%] bg-[linear-gradient(120deg,transparent_20%,rgb(255_176_32/0.22)_45%,rgb(242_85_29/0.2)_60%,transparent_80%)]"
          />
          <div aria-hidden className="bg-geo-light absolute inset-0 [mask-image:radial-gradient(60%_80%_at_50%_100%,black,transparent)]" />
          <LogoMark variant="glyph" className="relative mx-auto size-16" />
          <h2 id="cta-title" className="type-h1 relative mx-auto mt-6 max-w-2xl text-sand">
            Ready to stop missing customers?
          </h2>
          <p className="type-lead relative mx-auto mt-4 max-w-xl text-sand/75">
            Power your business on WhatsApp — and give every customer a fast, reliable answer.
          </p>
          <div className="relative mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="group">
              <Link href="/register">
                Get Started
                <Zap className="size-5 fill-current transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline-light">
              <Link href="/#how-it-works">See How It Works</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
