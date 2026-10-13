"use client";

import {
  BarChart3Icon,
  BookOpenIcon,
  CalendarCheckIcon,
  ClipboardListIcon,
  FileBarChartIcon,
  GraduationCapIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  SettingsIcon,
  TrophyIcon,
  UserCogIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Role } from "@/generated/prisma/enums";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils/cn";
import { humanize, initials } from "@/lib/utils/format";
import { NAVIGATION, type NavIcon } from "./nav-config";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboardIcon,
  students: GraduationCapIcon,
  teachers: UsersIcon,
  academics: BookOpenIcon,
  attendance: CalendarCheckIcon,
  report: FileBarChartIcon,
  exams: ClipboardListIcon,
  fees: WalletIcon,
  reports: BarChart3Icon,
  users: UserCogIcon,
  audit: HistoryIcon,
  settings: SettingsIcon,
  profile: UserIcon,
  results: TrophyIcon,
};

function isActive(pathname: string, href: string, allHrefs: string[]) {
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  // Prefer the most specific match (e.g. /attendance/report over /attendance).
  return !allHrefs.some((other) => other !== href && other.startsWith(href) && pathname.startsWith(other));
}

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = NAVIGATION[role];
  const hrefs = items.map((i) => i.href);
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href, hrefs);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "hover:bg-sidebar-active flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:text-white",
              active ? "bg-sidebar-active font-medium text-white" : "text-sidebar-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ institution }: { institution: string }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-3 py-1">
      <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg text-sm font-bold">
        E
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">EduManage</span>
        <span className="text-sidebar-foreground block truncate text-xs">{institution}</span>
      </span>
    </Link>
  );
}

function UserBlock({ name, role }: { name: string; role: Role }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    const { error } = await authClient.signOut();
    if (error) {
      toast.error("Could not sign out. Try again.");
      setBusy(false);
      return;
    }
    router.replace("/login");
    router.refresh();
  }
  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <Link href="/account" className="hover:bg-sidebar-active flex items-center gap-3 rounded-md px-3 py-2">
        <span className="bg-sidebar-active grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white">
          {initials(name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-white">{name}</span>
          <span className="text-sidebar-foreground block text-xs">{humanize(role)} · Account</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="text-sidebar-foreground hover:bg-sidebar-active flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:text-white disabled:opacity-50"
      >
        <LogOutIcon className="size-4" aria-hidden /> Sign out
      </button>
    </div>
  );
}

type ShellNavProps = { role: Role; name: string; institution: string };

/** Fixed sidebar on large screens. */
export function Sidebar({ role, name, institution }: ShellNavProps) {
  return (
    <aside className="bg-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-4 p-3 lg:flex print:hidden">
      <Brand institution={institution} />
      <div className="flex-1 overflow-y-auto">
        <NavLinks role={role} />
      </div>
      <UserBlock name={name} role={role} />
    </aside>
  );
}

/** Top bar with a slide-in menu on phones and tablets. */
export function MobileNav({ role, name, institution }: ShellNavProps) {
  const [open, setOpen] = useState(false);
  return (
    <header className="bg-card sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-2 lg:hidden print:hidden">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <MenuIcon />
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-sidebar text-sidebar-foreground top-0 left-0 h-full max-h-none w-72 max-w-[85vw] translate-x-0 translate-y-0 rounded-none border-0 p-3">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <div className="flex h-full flex-col gap-4">
            <Brand institution={institution} />
            <div className="flex-1 overflow-y-auto">
              <NavLinks role={role} onNavigate={() => setOpen(false)} />
            </div>
            <UserBlock name={name} role={role} />
          </div>
        </DialogContent>
      </Dialog>
      <span className="font-semibold">EduManage</span>
    </header>
  );
}
