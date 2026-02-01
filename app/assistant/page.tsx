"use client";

import { useState } from "react";
import AuthWorkspaceGate from "@/components/AuthWorkspaceGate";

export default function AssistantPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi! You can say things like:\n• Sold 3 Rice at $4 each\n• Add product Milk\n• Add expense Gas $25",
    },
  ]);

  async function send() {
  if (!input.trim()) return;

  const userMessage = { role: "user", content: input };
  setMessages((prev) => [...prev, userMessage]);
const workspace_id = localStorage.getItem("workspace_id");
const originalText = input;

// 1) AI parse → many commands
const aiRes = await fetch("/api/assistant", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: originalText }),
});
const aiData = await aiRes.json();

if (!aiData.ok) {
  // show error
  return;
}

// 2) Execute all commands
const dbRes = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    workspace_id,
    commands: aiData.commands,
  }),
});

const dbData = await dbRes.json();


  setMessages((prev) => [
    ...prev,
    {
      role: "assistant",
      content: dbData.ok ? dbData.reply : "Error: " + dbData.error,
    },
  ]);
}


  return (
    <AuthWorkspaceGate>
      <div style={{ maxWidth: 800, margin: "40px auto", padding: 20 }}>
        <h1>Assistant</h1>

        <div style={{ border: "1px solid #ddd", padding: 12, height: 400, overflowY: "auto" }}>
          {messages.map((m, i) => (
            <div key={i} style={{ textAlign: m.role === "user" ? "right" : "left", margin: "8px 0" }}>
              <div
                style={{
                  display: "inline-block",
                  padding: "8px 12px",
                  borderRadius: 10,
                  background: m.role === "user" ? "#111" : "#f0f0f0",
                  color: m.role === "user" ? "#fff" : "#000",
                  maxWidth: "70%",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", marginTop: 10 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a command..."
            style={{ flex: 1, padding: 10 }}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button onClick={send} style={{ padding: "10px 16px" }}>
            Send
          </button>
        </div>
      </div>
    </AuthWorkspaceGate>
  );
}

