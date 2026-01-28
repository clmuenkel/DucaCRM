import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default function Home() {
  // Direct access to dashboard - no auth required for personal CRM
  redirect("/dashboard");
}
