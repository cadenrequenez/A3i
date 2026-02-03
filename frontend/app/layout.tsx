import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "A3i Scheduler",
  description: "Artificial Anesthesia Administrative Intelligence"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
