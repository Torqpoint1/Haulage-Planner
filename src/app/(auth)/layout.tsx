import { Truck } from "lucide-react";
import { APP_NAME } from "@/components/shell/nav";

/** Centred card for sign-in, sign-up, onboarding and invitations. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="flex items-center gap-3">
        <span className="flex size-avatar items-center justify-center rounded-md bg-accent text-accent-fg">
          <Truck className="size-icon-sm" aria-hidden />
        </span>
        <span className="text-base font-semibold">{APP_NAME}</span>
      </div>
      <div className="w-full max-w-modal rounded-lg border border-border bg-surface p-6 md:p-8">
        {children}
      </div>
    </main>
  );
}
