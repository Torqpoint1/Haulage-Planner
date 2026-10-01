import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider, themeInitScript } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/components/shell/nav";
import { DEFAULT_ACCENT, accentCss } from "@/lib/color";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Plan fuller loads, pick the cheapest valid option, and stop failed deliveries.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#151920" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // The organisation's accent colour replaces DEFAULT_ACCENT once
  // organisations exist (Stage 2); contrast is adjusted automatically.
  const accent = DEFAULT_ACCENT;

  return (
    <html lang="en-GB" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <style id="org-accent" dangerouslySetInnerHTML={{ __html: accentCss(accent) }} />
      </head>
      <body>
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
