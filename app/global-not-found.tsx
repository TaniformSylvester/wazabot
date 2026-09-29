import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["700"], display: "swap" });

export const metadata: Metadata = {
  title: "404 — WazaBolt",
  robots: { index: false },
};

/** Fallback for URLs outside /en and /fr that no route matches. Bilingual because no locale is known. */
export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} h-full`}>
      <body className="flex min-h-full flex-col items-center justify-center gap-6 px-4 py-24 text-center">
        <p className="type-label text-waza-700">404</p>
        <h1 className="type-h1">Page not found</h1>
        <p lang="fr" className="type-lead -mt-3 text-slate">Page introuvable</p>
        <div className="flex gap-3">
          <Link href="/en" className="rounded-full bg-waza-500 px-5 py-2.5 font-semibold text-deep">Home</Link>
          <Link href="/fr" lang="fr" className="rounded-full border border-line px-5 py-2.5 font-semibold text-deep">Accueil</Link>
        </div>
      </body>
    </html>
  );
}
