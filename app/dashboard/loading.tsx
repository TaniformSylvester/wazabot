export default function DashboardLoading() {
  return (
    <div className="mx-auto flex max-w-6xl animate-pulse flex-col gap-8" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-64 rounded-xl bg-sand-200" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-sand-200" />
        ))}
      </div>
      <div className="h-80 rounded-3xl bg-sand-200" />
    </div>
  );
}
