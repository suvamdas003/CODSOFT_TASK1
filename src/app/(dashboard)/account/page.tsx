import type { Metadata } from "next";
import { DetailList, PageHeader, StatusBadge } from "@/components/shared/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/auth/change-password-form";
import { requireActor } from "@/server/auth/session";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const actor = await requireActor();
  return (
    <>
      <PageHeader title="Account" description="Your sign-in details." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                { label: "Name", value: actor.name },
                { label: "Email", value: actor.email },
                { label: "Role", value: <StatusBadge status={actor.role} /> },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>At least 8 characters with a letter and a number.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
