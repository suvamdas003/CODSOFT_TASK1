import { BookOpenIcon, CalendarRangeIcon, LayersIcon, UserCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page";
import { Card, CardContent } from "@/components/ui/card";
import { Role } from "@/generated/prisma/enums";
import { requireActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/services/academics.service";

export const metadata: Metadata = { title: "Academics" };

export default async function AcademicsPage() {
  await requireActor(Role.ADMIN);
  const current = await getCurrentSession();
  const [sessions, classes, sections, subjects, assignments] = await Promise.all([
    prisma.academicSession.count(),
    prisma.schoolClass.count(),
    current ? prisma.section.count({ where: { academicSessionId: current.id } }) : 0,
    prisma.subject.count({ where: { isActive: true } }),
    current ? prisma.teachingAssignment.count({ where: { section: { academicSessionId: current.id } } }) : 0,
  ]);
  const cards = [
    {
      href: "/academics/sessions",
      title: "Academic sessions",
      icon: CalendarRangeIcon,
      detail: `${sessions} session(s) · current: ${current?.name ?? "none"}`,
    },
    {
      href: "/academics/classes",
      title: "Classes & sections",
      icon: LayersIcon,
      detail: `${classes} class(es) · ${sections} section(s) this session`,
    },
    { href: "/academics/subjects", title: "Subjects", icon: BookOpenIcon, detail: `${subjects} active subject(s)` },
    {
      href: "/academics/assignments",
      title: "Teaching assignments",
      icon: UserCheckIcon,
      detail: `${assignments} assignment(s) this session`,
    },
  ];
  return (
    <>
      <PageHeader
        title="Academics"
        description="Configure sessions, classes, sections, subjects and who teaches what."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="block rounded-xl">
            <Card className="hover:border-primary/40 h-full transition-colors">
              <CardContent className="flex items-start gap-4 p-5">
                <span className="bg-secondary text-secondary-foreground grid size-10 shrink-0 place-items-center rounded-lg">
                  <card.icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold">{card.title}</span>
                  <span className="text-muted-foreground block text-sm">{card.detail}</span>
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
