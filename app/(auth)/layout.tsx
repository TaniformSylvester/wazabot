import Link from "next/link";

import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[radial-gradient(60%_60%_at_50%_0%,#e9faf3_0%,transparent_70%)]">
      <header className="container-page flex h-20 items-center">
        <Link href="/" aria-label="WazaBot home" className="rounded-lg">
          <Logo />
        </Link>
      </header>
      <main className="container-page flex flex-1 items-start justify-center pb-20 pt-8">{children}</main>
    </div>
  );
}
