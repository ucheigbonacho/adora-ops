"use client";

import { useEffect, useRef, useState } from "react";
import AuthWorkspaceGate from "@/components/AuthWorkspaceGate";

type Msg = { role: "user" | "assistant"; content: string };

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function AssistantPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi! Tap the mic to speak.\nExamples:\n• Sold 3 Rice at $4 each\n• Add product Milk\n• Add expense Gas $25",
    },
  ]);

  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const finalTextRef = useRef<string>("");
  const inactivityTimerRef = useRef<any>(null);

  // 3 mins hard-stop
  const HARD_STOP_MS = 3 * 60 * 1000;

  useEffect(() => {
    const SR = getSpeechRecognition();
    if (!SR) {
      setMicError("Voice input not supported on this browser (use Chrome/Edge).");
      return;
    }

    const rec = new SR();
    rec.lang = "en-US"; // change if needed
    rec.interimResults = true; // we use this to keep updating while speaking
    rec.continuous = true; // keep session running; we stop on silence via onend

    rec.onstart = () => {
      setMicError(null);
      setListening(true);
      finalTextRef.current = "";
      // hard stop
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        stopListening();
      }, HARD_STOP_MS);
    };

    rec.onerror = (e: any) => {
      setMicError(e?.error || "Mic error");
      setListening(false);
      clearTimeout(inactivityTimerRef.current);
    };

    rec.onresult = (event: any) => {
      // build combined transcript (final + interim)
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const txt = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) {
          finalTextRef.current += txt + " ";
        } else {
          interim += txt;
        }
      }

      const combined = (finalTextRef.current + interim).trim();
      setInput(combined);

      // Reset hard-stop on any speech result (counts as activity)
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        stopListening();
      }, HARD_STOP_MS);
    };

    // IMPORTANT:
    // In Web Speech, it will naturally stop when it detects end of speech / silence.
    // When it ends, we treat it as "user finished talking".
    rec.onend = () => {
      const spoken = (finalTextRef.current || "").trim() || input.trim();
      setListening(false);
      clearTimeout(inactivityTimerRef.current);

      // If we have text, auto-send it.
      if (spoken) {
        setInput(spoken);
        // auto-send after mic finishes
        send(spoken);
      }
    };

    recognitionRef.current = rec;

    return () => {
      try {
        rec.stop();
      } catch {}
      clearTimeout(inactivityTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startListening() {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      finalTextRef.current = "";
      rec.start();
    } catch (e) {
      // Chrome throws if start() called twice quickly
    }
  }

  function stopListening() {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {}
  }

  function toggleMic() {
    if (micError) return;
    if (listening) stopListening();
    else startListening();
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text) return;

    const userMessage: Msg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    const workspace_id = localStorage.getItem("workspace_id");

    // 1) AI parse -> commands
    const aiRes = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const aiData = await aiRes.json().catch(() => ({}));

    if (!aiData?.ok) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: " + (aiData?.error || "AI parse failed") },
      ]);
      return;
    }

    // 2) Execute commands
    const dbRes = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id,
        commands: aiData.commands,
      }),
    });
    const dbData = await dbRes.json().catch(() => ({}));

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: dbData?.ok ? dbData.reply : "Error: " + (dbData?.error || "Request failed"),
      },
    ]);
  }

  return (
    <AuthWorkspaceGate>
      <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
        <h1 style={{ margin: 0 }}>Assistant</h1>
        <p style={{ marginTop: 6, color: "#5B6475" }}>
          Tap the mic to speak. It stops when you finish talking (or tap again).
        </p>

        {micError ? (
          <div style={{ marginTop: 10, padding: 10, border: "1px solid #FCA5A5", borderRadius: 12, background: "#FFF1F2" }}>
            {micError}
          </div>
        ) : null}

        <div
          style={{
            marginTop: 12,
            border: "1px solid #E6E8EE",
            borderRadius: 16,
            padding: 12,
            height: 420,
            overflowY: "auto",
            background: "#fff",
          }}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                textAlign: m.role === "user" ? "right" : "left",
                margin: "8px 0",
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  padding: "10px 12px",
                  borderRadius: 14,
                  background: m.role === "user" ? "#0B1220" : "#F7F8FB",
                  color: m.role === "user" ? "#fff" : "#0B1220",
                  maxWidth: "80%",
                  whiteSpace: "pre-wrap",
                  border: "1px solid #E6E8EE",
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
          <button
            onClick={toggleMic}
            disabled={!!micError}
            style={{
              width: 48,
              height: 48,
              borderRadius: 999,
              border: listening ? "2px solid #EF4444" : "1px solid #E6E8EE",
              background: listening ? "rgba(239,68,68,0.10)" : "#fff",
              cursor: "pointer",
              fontSize: 18,
              fontWeight: 900,
            }}
            aria-label="Mic"
            title={listening ? "Tap to stop" : "Tap to speak"}
          >
            {listening ? "■" : "🎤"}
          </button>

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? "Listening…" : "Type a command…"}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 14,
              border: "1px solid #E6E8EE",
              outline: "none",
              fontSize: 15,
            }}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />

          <button
            onClick={() => send()}
            style={{
              padding: "12px 16px",
              borderRadius: 14,
              border: "1px solid #0B1220",
              background: "#0B1220",
              color: "#fff",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Send
          </button>
        </div>
      </div>
    </AuthWorkspaceGate>
  );
}
