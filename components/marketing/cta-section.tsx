import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { WazaBoltIcon } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

/** Closing call-to-action used at the bottom of marketing pages. */
export function CTASection({
  title = "Ready to stop missing customers?",
  text = `${siteConfig.headline} Give every customer a fast, reliable answer — day and night.`,
}: {
  title?: string;
  text?: string;
}) {
  return (
    <section aria-labelledby="cta-title" className="py-20 sm:py-28">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-3xl bg-deep px-6 py-16 text-center sm:px-12 sm:py-20">
          <div
            aria-hidden
            className="absolute inset-0 animate-gradient bg-[length:200%_200%] bg-[linear-gradient(120deg,transparent_20%,rgb(22_184_120/0.22)_45%,rgb(255_200_61/0.14)_62%,transparent_82%)]"
          />
          <div aria-hidden className="bg-geo-light absolute inset-0 [mask-image:radial-gradient(60%_80%_at_50%_100%,black,transparent)]" />
          <WazaBoltIcon tone="dark" className="group/logo relative mx-auto size-16" />
          <h2 id="cta-title" className="type-h1 relative mx-auto mt-6 max-w-2xl text-white">
            {title}
          </h2>
          <p className="type-lead relative mx-auto mt-4 max-w-xl text-white/75">{text}</p>
          <div className="relative mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="group">
              <Link href="/register">
                Start Free
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline-light">
              <Link href="/how-it-works">See How It Works</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
