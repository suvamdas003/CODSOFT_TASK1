import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TextField } from "@/components/shared/action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/shared/filter-bar";
import { FormDialog } from "@/components/shared/form-dialog";
import { EmptyState, PageHeader, Pagination, StatusBadge } from "@/components/shared/page";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Role } from "@/generated/prisma/enums";
import { createAdminAction, resetPasswordAction, setUserActiveAction } from "@/features/users/actions";
import { isEnumValue, roleOptions } from "@/lib/options";
import { formatDateTime } from "@/lib/utils/dates";
import { param, parsePagination } from "@/lib/utils/pagination";
import { requireActor } from "@/server/auth/session";
import { listUsers } from "@/server/services/user.service";

export const metadata: Metadata = { title: "User accounts" };

export default async function UsersPage({ searchParams }: PageProps<"/users">) {
  const actor = await requireActor(Role.ADMIN);
  const sp = await searchParams;
  const role = param(sp.role);
  const active = param(sp.active);
  const filters = {
    q: param(sp.q),
    role: isEnumValue(Role, role) ? role : undefined,
    active: active === "yes" ? true : active === "no" ? false : undefined,
  };
  const result = await listUsers(actor, filters, parsePagination(sp.page));

  return (
    <>
      <PageHeader
        title="User accounts"
        description="Sign-in access for every role. Student and teacher accounts are created from their profiles."
        actions={
          <FormDialog
            action={createAdminAction}
            title="New administrator"
            triggerLabel={
              <>
                <PlusIcon aria-hidden /> New administrator
              </>
            }
            submitLabel="Create"
          >
            <TextField name="name" label="Full name" required maxLength={120} />
            <TextField name="email" label="Email" type="email" required maxLength={254} autoComplete="off" />
            <TextField
              name="password"
              label="Initial password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              description="At least 8 characters with a letter and a number."
            />
          </FormDialog>
        }
      />
      <FilterBar basePath="/users">
        <FilterSearch defaultValue={filters.q} placeholder="Name or email" />
        <FilterSelect name="role" label="Role" defaultValue={filters.role} options={roleOptions} />
        <FilterSelect
          name="active"
          label="Sign-in"
          defaultValue={active}
          options={[
            { value: "yes", label: "Enabled" },
            { value: "no", label: "Disabled" },
          ]}
        />
      </FilterBar>
      {result.items.length === 0 ? (
        <EmptyState title="No accounts found" />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Last sign-in</TableHead>
                <TableHead>Sign-in</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((u) => {
                const profileHref = u.studentProfile
                  ? `/students/${u.studentProfile.id}`
                  : u.teacherProfile
                    ? `/teachers/${u.teacherProfile.id}`
                    : null;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      {profileHref ? (
                        <Link href={profileHref} className="text-primary font-medium hover:underline">
                          {u.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{u.name}</span>
                      )}
                      <div className="text-muted-foreground text-xs">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={u.role} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{formatDateTime(u.lastLoginAt)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={u.isActive ? "ACTIVE" : "INACTIVE"}
                        label={u.isActive ? "Enabled" : "Disabled"}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <FormDialog
                          action={resetPasswordAction}
                          title={`Reset password for ${u.name}`}
                          description="The user will be signed out of all devices."
                          triggerLabel="Reset password"
                          triggerVariant="outline"
                          triggerSize="sm"
                          submitLabel="Reset"
                        >
                          <input type="hidden" name="userId" value={u.id} />
                          <TextField
                            name="password"
                            label="New password"
                            type="password"
                            required
                            minLength={8}
                            maxLength={128}
                            autoComplete="new-password"
                          />
                        </FormDialog>
                        {u.id !== actor.userId ? (
                          <ConfirmAction
                            action={setUserActiveAction.bind(null, u.id, !u.isActive)}
                            title={u.isActive ? `Disable sign-in for ${u.name}?` : `Enable sign-in for ${u.name}?`}
                            description={
                              u.isActive
                                ? "Active sessions are ended immediately. Records are not affected."
                                : "The user will be able to sign in again."
                            }
                            confirmLabel={u.isActive ? "Disable" : "Enable"}
                            destructive={u.isActive}
                          >
                            {u.isActive ? "Disable" : "Enable"}
                          </ConfirmAction>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        basePath="/users"
        searchParams={sp}
      />
    </>
  );
}
