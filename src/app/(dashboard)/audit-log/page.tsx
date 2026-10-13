import type { Metadata } from "next";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/shared/filter-bar";
import { EmptyState, PageHeader, Pagination } from "@/components/shared/page";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Role } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/utils/dates";
import { humanize } from "@/lib/utils/format";
import { param, parsePagination } from "@/lib/utils/pagination";
import { requireActor } from "@/server/auth/session";
import { listAuditEntityTypes, listAuditLogs } from "@/server/services/audit.service";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditLogPage({ searchParams }: PageProps<"/audit-log">) {
  const actor = await requireActor(Role.ADMIN);
  const sp = await searchParams;
  const filters = { q: param(sp.q), entityType: param(sp.entityType) };
  const [result, types] = await Promise.all([
    listAuditLogs(actor, filters, parsePagination(sp.page)),
    listAuditEntityTypes(actor),
  ]);
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Append-only record of administrative changes. Passwords and secrets are never logged."
      />
      <FilterBar basePath="/audit-log">
        <FilterSearch defaultValue={filters.q} placeholder="Search summaries" />
        <FilterSelect
          name="entityType"
          label="Type"
          defaultValue={filters.entityType}
          options={types.map((t) => ({ value: t, label: t }))}
        />
      </FilterBar>
      {result.items.length === 0 ? (
        <EmptyState title="No audit events" />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs whitespace-nowrap">{formatDateTime(e.createdAt)}</TableCell>
                  <TableCell>
                    {e.actor?.name ?? "System"}
                    {e.actor ? <div className="text-muted-foreground text-xs">{humanize(e.actor.role)}</div> : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.action}</TableCell>
                  <TableCell>{e.summary}</TableCell>
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
        basePath="/audit-log"
        searchParams={sp}
      />
    </>
  );
}
