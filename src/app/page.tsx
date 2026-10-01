import { redirect } from "next/navigation";
import { homePath } from "@/lib/auth/roles";
import { requireMember } from "@/lib/auth/session";

export default async function Home() {
  const session = await requireMember();
  redirect(homePath(session.membership.role));
}
