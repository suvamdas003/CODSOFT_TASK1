import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/shared/filter-bar";
import { EmptyState, PageHeader, Pagination, StatusBadge } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Role, TeacherStatus } from "@/generated/prisma/enums";
import { isEnumValue, teacherStatusOptions } from "@/lib/options";
import { formatDate } from "@/lib/utils/dates";
import { fullName } from "@/lib/utils/format";
import { param, parsePagination } from "@/lib/utils/pagination";
import { requireActor } from "@/server/auth/session";
import { listTeachers } from "@/server/services/teacher.service";

export const metadata: Metadata = { title: "Teachers" };

export default async function TeachersPage({ searchParams }: PageProps<"/teachers">) {
  const actor = await requireActor(Role.ADMIN);
  const sp = await searchParams;
  const status = param(sp.status);
  const filters = { q: param(sp.q), status: isEnumValue(TeacherStatus, status) ? status : undefined };
  const result = await listTeachers(actor, filters, parsePagination(sp.page));
  return (
    <>
      <PageHeader
        title="Teachers"
        description="Teacher profiles, sign-in accounts and assignments."
        actions={
          <Button asChild>
            <Link href="/teachers/new">
              <PlusIcon aria-hidden /> Add teacher
            </Link>
          </Button>
        }
      />
      <FilterBar basePath="/teachers">
        <FilterSearch defaultValue={filters.q} placeholder="Name or employee ID" />
        <FilterSelect name="status" label="Status" defaultValue={filters.status} options={teacherStatusOptions} />
      </FilterBar>
      {result.items.length === 0 ? (
        <EmptyState title="No teachers found" />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Specialization</TableHead>
                <TableHead className="hidden md:table-cell">Joined</TableHead>
                <TableHead className="text-right">Assignments</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.employeeId}</TableCell>
                  <TableCell>
                    <Link href={`/teachers/${t.id}`} className="text-primary font-medium hover:underline">
                      {fullName(t)}
                    </Link>
                    <div className="text-muted-foreground text-xs">{t.user.email}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{t.specialization ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{formatDate(t.joiningDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{t._count.assignments}</TableCell>
                  <TableCell>
                    <StatusBadge status={t.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        basePath="/teachers"
        searchParams={sp}
      />
    </>
  );
}
