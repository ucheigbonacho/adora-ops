"use client";

import dynamic from "next/dynamic";

const AssistantWidget = dynamic(() => import("./AssistantWidget"), {
  ssr: false,
});

export default function AssistantWidgetClientOnly() {
  return <AssistantWidget />;
}
