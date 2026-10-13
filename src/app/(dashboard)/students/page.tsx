import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/shared/filter-bar";
import { EmptyState, PageHeader, Pagination, StatusBadge } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Role, StudentStatus } from "@/generated/prisma/enums";
import { isEnumValue, studentStatusOptions } from "@/lib/options";
import { fullName, sectionLabel } from "@/lib/utils/format";
import { param, parsePagination } from "@/lib/utils/pagination";
import { requireActor } from "@/server/auth/session";
import { sectionOptions } from "@/server/services/academics.service";
import { listStudents } from "@/server/services/student.service";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage({ searchParams }: PageProps<"/students">) {
  const actor = await requireActor(Role.ADMIN, Role.TEACHER);
  const sp = await searchParams;
  const status = param(sp.status);
  const filters = {
    q: param(sp.q),
    sectionId: param(sp.sectionId),
    status: isEnumValue(StudentStatus, status) ? status : undefined,
  };
  const [result, sections] = await Promise.all([
    listStudents(actor, filters, parsePagination(sp.page)),
    sectionOptions(actor, { allSessions: actor.role === Role.ADMIN }),
  ]);
  const isAdmin = actor.role === Role.ADMIN;

  return (
    <>
      <PageHeader
        title={isAdmin ? "Students" : "My students"}
        description={
          isAdmin ? "Search, filter and manage student records." : "Students in the class sections you teach."
        }
        actions={
          isAdmin ? (
            <Button asChild>
              <Link href="/students/new">
                <PlusIcon aria-hidden /> Add student
              </Link>
            </Button>
          ) : null
        }
      />
      <FilterBar basePath="/students">
        <FilterSearch defaultValue={filters.q} placeholder="Name, admission no. or guardian" />
        <FilterSelect
          name="sectionId"
          label="Section"
          defaultValue={filters.sectionId}
          options={sections.map((s) => ({ value: s.id, label: s.label }))}
        />
        <FilterSelect name="status" label="Status" defaultValue={filters.status} options={studentStatusOptions} />
      </FilterBar>

      {result.items.length === 0 ? (
        <EmptyState
          title="No students found"
          description={
            filters.q || filters.sectionId || filters.status
              ? "Try different filters."
              : "Students you add will appear here."
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admission no.</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Class</TableHead>
                <TableHead className="hidden md:table-cell">Guardian</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.admissionNumber}</TableCell>
                  <TableCell>
                    <Link href={`/students/${s.id}`} className="text-primary font-medium hover:underline">
                      {fullName(s)}
                    </Link>
                    <div className="text-muted-foreground text-xs">{s.user.email}</div>
                  </TableCell>
                  <TableCell>
                    {s.section ? sectionLabel(s.section) : <span className="text-muted-foreground">Unassigned</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {s.guardianName}
                    <div className="text-muted-foreground text-xs">{s.guardianPhone}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
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
        basePath="/students"
        searchParams={sp}
      />
    </>
  );
}
