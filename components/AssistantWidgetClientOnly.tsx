"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const AssistantWidget = dynamic(() => import("./AssistantWidget"), { ssr: false });

export default function AssistantWidgetClientOnly() {
  const pathname = usePathname();

  // 👇 Hide bot on these routes
  const hiddenRoutes = ["/pricing", "/billing", "/login"];

  if (hiddenRoutes.some((r) => pathname.startsWith(r))) {
    return null;
  }

  return <AssistantWidget />;
}



