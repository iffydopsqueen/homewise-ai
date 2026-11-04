import DashboardCards from "../components/DashboardCards";

// Dashboard (restructuring P3): server-rendered overview shell with live
// per-workflow cards. The cards subscribe to the shared session store, so
// they reflect drafts and completed results until a refresh clears the
// memory-only session.
export default function Dashboard() {
  return (
    <main className="w-full py-10">
      <h1 className="text-3xl font-bold tracking-tight text-t-ink">
        HomeWise AI
      </h1>
      <p className="mt-3 text-lg text-t-body">
        Understand the true cost of homeownership before you buy.
      </p>
      <p className="mt-2 text-sm text-t-muted">
        Complete a workflow below to see its results here. Results stay in
        this browser session and clear when you refresh or close the tab.
      </p>
      <DashboardCards />
    </main>
  );
}
