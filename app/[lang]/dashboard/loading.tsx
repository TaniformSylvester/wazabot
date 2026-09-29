import { getMessages } from "@/lib/i18n/dictionaries";

export default async function DashboardLoading() {
  const t = await getMessages();
  return (
    <div className="mx-auto flex max-w-6xl animate-pulse flex-col gap-8" aria-busy="true" aria-label={t.dashboard.loading}>
      <div className="h-9 w-64 rounded-xl bg-line" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-line" />
        ))}
      </div>
      <div className="h-80 rounded-3xl bg-line" />
    </div>
  );
}
