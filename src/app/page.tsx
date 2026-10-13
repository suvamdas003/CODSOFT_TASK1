import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/session";

export default async function HomePage() {
  const actor = await getActor();
  redirect(actor ? "/dashboard" : "/login");
}
