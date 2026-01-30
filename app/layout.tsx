import type { Metadata } from "next";
import TopNav from "@/components/TopNav";

export const metadata: Metadata = {
  title: "Adora Ops",
  description: "Operations Management MVP",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Top navigation bar */}
        <TopNav />

        {/* Page content */}
        <div style={{ padding: 16 }}>
          {children}
        </div>
      </body>
    </html>
  );
}
