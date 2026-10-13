import { MobileNav, Sidebar } from "@/components/layout/app-nav";
import { requireActor } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings.service";

/** Authenticated application shell. Every page below also authorizes its own data access. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const settings = await getSettings();
  return (
    <div className="min-h-screen">
      <Sidebar role={actor.role} name={actor.name} institution={settings.name} />
      <MobileNav role={actor.role} name={actor.name} institution={settings.name} />
      <main className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-8 print:m-0 print:p-0">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
