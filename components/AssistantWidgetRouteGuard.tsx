"use client";

import { usePathname } from "next/navigation";
import AssistantWidgetClientOnly from "@/components/AssistantWidgetClientOnly";

export default function AssistantWidgetRouteGuard() {
  const pathname = usePathname();

  // Hide Adora widget on these pages
  if (pathname === "/" || pathname === "/login" || pathname === "/setup") {
    return null;
  }

  return <AssistantWidgetClientOnly />;
}
