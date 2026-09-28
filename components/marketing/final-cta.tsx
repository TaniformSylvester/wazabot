import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="pb-20 sm:pb-28">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-deep px-6 py-16 text-center sm:px-12 sm:py-20">
          <div aria-hidden className="absolute -left-20 -top-20 size-72 rounded-full bg-waza-500/25 blur-3xl" />
          <div aria-hidden className="absolute -bottom-24 -right-16 size-72 rounded-full bg-gold/20 blur-3xl" />
          <LogoMark className="relative mx-auto size-14" />
          <h2 id="cta-title" className="relative mx-auto mt-6 max-w-2xl text-3xl font-extrabold text-white sm:text-5xl">
            Ready to stop missing customers?
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-white/75">
            Give your business a receptionist that never sleeps.
          </p>
          <div className="relative mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" variant="gold" className="group">
              <Link href="/register">
                Start Free <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
              <Link href="/#how-it-works">See How It Works</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
