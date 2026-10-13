import { DetailList, StatusBadge } from "@/components/shared/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { humanize, sectionLabel } from "@/lib/utils/format";
import type { StudentDetail } from "@/server/services/student.service";

export function StudentProfileCards({ student, showAccount }: { student: StudentDetail; showAccount: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              { label: "Admission number", value: <span className="font-mono">{student.admissionNumber}</span> },
              { label: "Status", value: <StatusBadge status={student.status} /> },
              {
                label: "Class / section",
                value: student.section
                  ? `${sectionLabel(student.section)} (${student.section.academicSession.name})`
                  : "Unassigned",
              },
              { label: "Enrollment date", value: formatDate(student.enrollmentDate) },
              { label: "Date of birth", value: formatDate(student.dateOfBirth) },
              { label: "Gender", value: humanize(student.gender) },
              { label: "Phone", value: student.phone },
              { label: "Address", value: student.address },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Guardian & account</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              { label: "Guardian", value: `${student.guardianName} (${student.guardianRelation})` },
              { label: "Guardian phone", value: student.guardianPhone },
              { label: "Guardian email", value: student.guardianEmail },
              { label: "Login email", value: student.user.email },
              ...(showAccount
                ? [
                    { label: "Sign-in", value: student.user.isActive ? "Enabled" : "Disabled" },
                    { label: "Last sign-in", value: formatDateTime(student.user.lastLoginAt) },
                  ]
                : []),
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
