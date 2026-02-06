import type { Metadata } from "next";
import TopNav from "@/components/TopNav";
import AssistantWidgetClientOnly from "@/components/AssistantWidgetClientOnly";

export const metadata: Metadata = {
  title: "Adora Ops",
  description: "Operations Management MVP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TopNav />
        <div style={{ padding: 16 }}>
          {children}
          <AssistantWidgetClientOnly />
        </div>
      </body>
    </html>
  );
}
