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

  // Tracks whether user intends mic to keep running (tap mic again to stop)
  const shouldRunRef = useRef(false);

  // Accumulates final transcript across results
  const finalTextRef = useRef<string>("");

  // Latest combined (final + interim) text so we can send on stop
  const latestCombinedRef = useRef<string>("");

  // Inactivity timer (3 minutes without results)
  const inactivityTimerRef = useRef<number | null>(null);

  // 3 mins inactivity stop
  const HARD_STOP_MS = 3 * 60 * 1000;

  function clearInactivity() {
    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }

  function armInactivity() {
    clearInactivity();
    inactivityTimerRef.current = window.setTimeout(() => {
      // Stop & send what we have after inactivity
      stopListening(true);
    }, HARD_STOP_MS);
  }

  useEffect(() => {
    const SR = getSpeechRecognition();
    if (!SR) {
      setMicError("Voice input not supported on this browser (use Chrome/Edge).");
      return;
    }

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;

    rec.onstart = () => {
      setMicError(null);
      setListening(true);
      armInactivity();
    };

    rec.onerror = (e: any) => {
      // Some mobile browsers frequently throw "no-speech" / "aborted"
      // We'll rely on onend auto-restart while shouldRunRef is true.
      setMicError(e?.error ? `Mic error: ${e.error}` : null);
    };

    rec.onresult = (event: any) => {
      armInactivity();

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
      latestCombinedRef.current = combined;
      setInput(combined);
    };

    rec.onend = () => {
      // 🔥 KEY FIX:
      // Mobile often ends quickly even if user is still speaking.
      // If user hasn't stopped the mic, we restart automatically.
      if (shouldRunRef.current) {
        try {
          rec.start();
          return;
        } catch {
          // If start() throws (too fast), retry shortly
          setTimeout(() => {
            if (!shouldRunRef.current) return;
            try {
              rec.start();
            } catch {}
          }, 250);
          return;
        }
      }

      // If user stopped (or inactivity stopped), finalize
      setListening(false);
      clearInactivity();
    };

    recognitionRef.current = rec;

    return () => {
      shouldRunRef.current = false;
      clearInactivity();
      try {
        rec.stop();
      } catch {}
    };
  }, []);

  function startListening() {
    if (micError) return;
    const rec = recognitionRef.current;
    if (!rec) return;

    shouldRunRef.current = true;
    finalTextRef.current = "";
    latestCombinedRef.current = "";
    setInput("");

    try {
      rec.start();
    } catch {
      // Chrome throws if start() called twice quickly - ignore
    }
  }

  // stopAndSend = whether we should send on stop (tap stop OR inactivity stop)
  function stopListening(stopAndSend: boolean) {
    const rec = recognitionRef.current;
    if (!rec) return;

    shouldRunRef.current = false;

    try {
      rec.stop();
    } catch {}

    setListening(false);
    clearInactivity();

    if (stopAndSend) {
      const spoken = (latestCombinedRef.current || finalTextRef.current || "").trim();
      if (spoken) {
        // Ensure UI shows final text, then send
        setInput(spoken);
        send(spoken);
      }
    }
  }

  function toggleMic() {
    if (micError) return;
    if (shouldRunRef.current) {
      // user tapped to stop -> stop & send
      stopListening(true);
    } else {
      // user tapped to start
      startListening();
    }
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
          Tap the mic to speak. Tap again to stop & send (auto-stops after 3 mins of inactivity).
        </p>

        {micError ? (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              border: "1px solid #FCA5A5",
              borderRadius: 12,
              background: "#FFF1F2",
            }}
          >
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
            title={listening ? "Tap to stop & send" : "Tap to speak"}
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
