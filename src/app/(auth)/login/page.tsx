import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/login-form";
import { getActor } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings.service";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getActor()) redirect("/dashboard");
  const settings = await getSettings();
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <span className="bg-primary text-primary-foreground mx-auto grid size-11 place-items-center rounded-xl text-lg font-bold">
            E
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to EduManage</h1>
          <p className="text-muted-foreground text-sm">{settings.name}</p>
        </div>
        <div className="bg-card rounded-xl border p-6 shadow-xs">
          <LoginForm />
        </div>
        <p className="text-muted-foreground text-center text-xs">
          Accounts are created by your school administrator. Contact them if you cannot sign in.
        </p>
      </div>
    </main>
  );
}
