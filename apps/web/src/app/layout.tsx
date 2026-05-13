import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/styles/globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Norgtech CRM",
  description: "Base operativa compartida del CRM comercial de Norgtech.",
};

const themeScript = `
  (function() {
    try {
      var theme = localStorage.getItem("theme");
      if (!theme || theme === "system") {
        theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      document.documentElement.classList.toggle("dark", theme === "dark");
    } catch (e) {}
  })();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-w-[320px] antialiased">
        <ThemeProvider defaultTheme="dark">
          <TooltipProvider delay={200}>
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                classNames: {
                  toast: "bg-card border-border text-foreground",
                },
              }}
            />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
