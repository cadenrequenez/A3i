export const metadata = {
  title: "A3i",
  description: "Artificial Anesthesia Administrative Intelligence",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
