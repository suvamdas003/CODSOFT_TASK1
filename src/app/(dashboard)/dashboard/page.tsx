import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { Role } from "@/generated/prisma/enums";
import { AdminDashboard } from "@/features/dashboard/admin-dashboard";
import { StudentDashboard } from "@/features/dashboard/student-dashboard";
import { TeacherDashboard } from "@/features/dashboard/teacher-dashboard";
import { requireActor } from "@/server/auth/session";
import { getAdminDashboard, getStudentDashboard, getTeacherDashboard } from "@/server/services/dashboard.service";
import { getSettings } from "@/server/services/settings.service";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const actor = await requireActor();
  const settings = await getSettings();
  const firstName = actor.name.split(" ")[0];

  if (actor.role === Role.ADMIN) {
    const data = await getAdminDashboard(actor);
    return (
      <>
        <PageHeader
          title="Administrator dashboard"
          description={`${settings.name}${data.session ? ` · ${data.session.name}` : ""}`}
        />
        <AdminDashboard data={data} currency={settings.currencyCode} locale={settings.locale} />
      </>
    );
  }

  if (actor.role === Role.TEACHER) {
    const data = await getTeacherDashboard(actor);
    return (
      <>
        <PageHeader title={`Welcome, ${firstName}`} description="Your classes, attendance and examination tasks." />
        <TeacherDashboard data={data} />
      </>
    );
  }

  const data = await getStudentDashboard(actor);
  return (
    <>
      <PageHeader title={`Welcome, ${firstName}`} description="Your attendance, results and fees at a glance." />
      {data ? (
        <StudentDashboard data={data} currency={settings.currencyCode} locale={settings.locale} />
      ) : (
        <EmptyState title="No student profile is linked to this account" description="Contact the school office." />
      )}
    </>
  );
}
