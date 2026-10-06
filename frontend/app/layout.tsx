import "./globals.css";
import "./workspace.css";
import "./schedule-exports.css";
import type { ReactNode } from "react";
import AppHeader from "../components/AppHeader";

export const metadata = {
  title: "A3i | Anesthesia Administration & Artificial Intelligence",
  description: "Built for anesthesia. Designed around your team. One intelligent workspace for scheduling, staffing, and team coordination."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <AppHeader />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
