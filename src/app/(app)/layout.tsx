import { AppShell } from "@/components/shell/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Placeholder identity until accounts arrive in Stage 1.
  return (
    <AppShell orgName="Example Doors Ltd" userName="Demo Planner">
      {children}
    </AppShell>
  );
}
