import type { Role } from "@/generated/prisma/enums";

export type NavIcon =
  | "dashboard"
  | "students"
  | "teachers"
  | "academics"
  | "attendance"
  | "report"
  | "exams"
  | "fees"
  | "reports"
  | "users"
  | "audit"
  | "settings"
  | "profile"
  | "results";

export type NavItem = { href: string; label: string; icon: NavIcon };

/**
 * Navigation per role. This only controls what is shown; every page and action
 * independently enforces authorization on the server.
 */
export const NAVIGATION: Record<Role, NavItem[]> = {
  ADMIN: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/students", label: "Students", icon: "students" },
    { href: "/teachers", label: "Teachers", icon: "teachers" },
    { href: "/academics", label: "Academics", icon: "academics" },
    { href: "/attendance", label: "Attendance", icon: "attendance" },
    { href: "/examinations", label: "Examinations", icon: "exams" },
    { href: "/fees", label: "Fees & payments", icon: "fees" },
    { href: "/reports", label: "Reports", icon: "reports" },
    { href: "/users", label: "User accounts", icon: "users" },
    { href: "/audit-log", label: "Audit log", icon: "audit" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  TEACHER: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/students", label: "My students", icon: "students" },
    { href: "/attendance", label: "Take attendance", icon: "attendance" },
    { href: "/attendance/report", label: "Attendance report", icon: "report" },
    { href: "/examinations", label: "Examinations", icon: "exams" },
  ],
  STUDENT: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/my/profile", label: "My profile", icon: "profile" },
    { href: "/my/attendance", label: "Attendance", icon: "attendance" },
    { href: "/my/results", label: "Results", icon: "results" },
    { href: "/my/fees", label: "Fees", icon: "fees" },
  ],
};
