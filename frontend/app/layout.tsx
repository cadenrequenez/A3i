import "./globals.css";
import type { ReactNode } from "react";
import AppHeader from "../components/AppHeader";

export const metadata = {
  title: "A3i Scheduler",
  description: "Artificial Anesthesia Administrative Intelligence"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-grid">
        <div className="fixed inset-0 -z-10 bg-orb opacity-80" aria-hidden />
        <AppHeader />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
