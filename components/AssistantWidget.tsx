"use client";

// components/AssistantWidget.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ChatMsg = {
  role: "user" | "assistant";
  text: string;
};

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

function safeStr(v: any) {
  return String(v ?? "").trim();
}

export default function AssistantWidget() {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      text:
        "Hi! Tell me what happened today. Examples:\n" +
        "• I sold 2 rice for 4 dollars each\n" +
        "• I paid gas bill 15 dollars\n" +
        "• I bought 3 bags of beans\n\n" +
        "You can also ask:\n" +
        "• did i make profit today?\n" +
        "• top selling products today\n" +
        "• paid vs unpaid revenue",
    },
  ]);

  const [input, setInput] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [userName, setUserName] = useState<string>("");

  // Voice
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);

  // Spacebar push-to-talk
  const isSpaceDownRef = useRef(false);
  const transcriptRef = useRef("");

  const listRef = useRef<HTMLDivElement | null>(null);

  const canUseVoice = useMemo(() => {
    if (typeof window === "undefined") return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }, []);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (!listRef.current) return;
      listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  }

  function safeErrMsg(e: any) {
    const msg =
      e?.message ||
      e?.error ||
      (typeof e === "string" ? e : "") ||
      "Unknown error";
    return String(msg);
  }

  // Optional TTS
  function speak(text: string) {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;
    const clean = safeStr(text);
    if (!clean) return;

    const u = new SpeechSynthesisUtterance(clean);
    u.lang = "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  // Load workspace + user name
  useEffect(() => {
    const wid =
      localStorage.getItem("workspace_id") ||
      localStorage.getItem("workspaceId") ||
      "";
    setWorkspaceId(wid);

    async function loadName() {
      try {
        const { data } = await supabase.auth.getUser();
        const u = data?.user;
        const meta =
          (u?.user_metadata?.full_name as string) ||
          (u?.user_metadata?.name as string) ||
          "";
        setUserName(meta.trim());
      } catch {
        setUserName("");
      }
    }

    loadName();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, open]);

  useEffect(() => {
    return () => {
      try {
        if (recRef.current) recRef.current.abort?.();
      } catch {}
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  async function sendToApi(textToSend: string) {
    const text = safeStr(textToSend);
    if (!text) throw new Error("No message provided.");

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: workspaceId,
        text,
        user_name: userName || undefined,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      throw new Error(json?.error || `Request failed (${res.status})`);
    }

    return json as { ok: true; reply?: string; results?: string[]; analytics?: any };
  }

  async function sendSpokenText(spoken: string) {
    const text = safeStr(spoken);
    if (!text) return;

    setInput("");
    transcriptRef.current = "";
    setLoading(true);
    setMessages((m) => [...m, { role: "user", text }]);

    try {
      const data = await sendToApi(text);
      const replyText = safeStr(data?.reply || "Done ✅") || "Done ✅";
      setMessages((m) => [...m, { role: "assistant", text: replyText }]);
      window.dispatchEvent(new Event("adora:refresh"));
      // speak(replyText);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `I ran into an error: ${safeErrMsg(e)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(textOverride?: string) {
    const text = safeStr(textOverride ?? input);
    if (!text) return;

    if (!workspaceId) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Workspace not found. Please login/setup again." },
      ]);
      return;
    }

    setInput("");
    transcriptRef.current = "";
    setLoading(true);
    setMessages((m) => [...m, { role: "user", text }]);

    try {
      const data = await sendToApi(text);
      const replyText = safeStr(data?.reply || "Done ✅") || "Done ✅";
      setMessages((m) => [...m, { role: "assistant", text: replyText }]);
      window.dispatchEvent(new Event("adora:refresh"));
      // speak(replyText);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `I ran into an error: ${safeErrMsg(e)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    const greet = userName ? `Hi ${userName}! ` : "Hi! ";
    setMessages([
      {
        role: "assistant",
        text:
          greet +
          "Tell me what happened today. Examples:\n" +
          "• I sold 2 rice for 4 dollars each\n" +
          "• I paid gas bill 15 dollars\n" +
          "• I bought 3 bags of beans\n\n" +
          "You can also ask:\n" +
          "• did i make profit today?\n" +
          "• top selling products today\n" +
          "• paid vs unpaid revenue",
      },
    ]);
    setInput("");
    transcriptRef.current = "";
  }

  // Voice
  function stopListening() {
    if (!recRef.current) return;
    try {
      recRef.current.stop?.();
    } catch {}
  }

  function startListening() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice input not supported on this browser. Use Chrome.");
      return;
    }

    if (!workspaceId) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Workspace not found. Please login/setup again." },
      ]);
      return;
    }

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    transcriptRef.current = "";
    setListening(true);

    const rec = new SpeechRecognition();
    recRef.current = rec;

    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    let finalText = "";
    let interimText = "";

    const resetSilenceTimer = () => {
      if (isSpaceDownRef.current) return;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => stopListening(), 1300);
    };

    rec.onstart = () => resetSilenceTimer();

    rec.onresult = (event: any) => {
      resetSilenceTimer();

      interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const t = r?.[0]?.transcript || "";
        if (r.isFinal) finalText += (finalText ? " " : "") + t;
        else interimText += t;
      }

      const combined = `${finalText}${interimText ? " " + interimText : ""}`.trim();
      setInput(combined);
      transcriptRef.current = combined;
    };

    rec.onerror = (e: any) => {
      setListening(false);
      const msg = e?.error ? `Voice error: ${e.error}` : "Voice input error.";
      setMessages((m) => [...m, { role: "assistant", text: msg }]);
    };

    rec.onend = async () => {
      setListening(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      const spoken = safeStr(transcriptRef.current) || safeStr(finalText);
      if (!spoken) return;

      await sendSpokenText(spoken);
    };

    try {
      rec.start();
    } catch (e) {
      setListening(false);
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `Voice start failed: ${safeErrMsg(e)}` },
      ]);
    }
  }

  function toggleVoice() {
    if (!canUseVoice) {
      alert("Voice works best in Chrome.");
      return;
    }
    if (loading) return;

    if (listening) stopListening();
    else startListening();
  }

  // SPACEBAR push-to-talk
  useEffect(() => {
    function isTypingInInput() {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      return (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        (el as any).isContentEditable
      );
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingInInput()) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (loading) return;
        if (!canUseVoice) return;
        if (isSpaceDownRef.current) return;

        isSpaceDownRef.current = true;

        if (!listening) {
          transcriptRef.current = "";
          setInput("");
          startListening();
        }
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (isTypingInInput()) return;

      if (e.code === "Space") {
        e.preventDefault();
        isSpaceDownRef.current = false;
        if (listening) stopListening();
      }
    }

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp, { passive: false });

    return () => {
      window.removeEventListener("keydown", onKeyDown as any);
      window.removeEventListener("keyup", onKeyUp as any);
    };
  }, [listening, loading, canUseVoice]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 9999,
          padding: "12px 14px",
          borderRadius: 999,
          border: "1px solid #ddd",
          background: "#111",
          color: "#fff",
          cursor: "pointer",
        }}
        title="Open Assistant"
      >
        Assistant
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        width: 380,
        height: 600,
        zIndex: 9999,
        border: "1px solid #e6e6e6",
        borderRadius: 16,
        background: "#fff",
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid #eee",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 900, display: "flex", gap: 8, alignItems: "center" }}>
          {/* Placeholder logo bubble */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "#111",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontSize: 12,
              fontWeight: 900,
            }}
            title="Adora Ops"
          >
            AO
          </div>
          <div>Assistant{userName ? ` • ${userName}` : ""}</div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={clearChat}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fafafa",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fafafa",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* ✅ PERMANENT BIG MIC PANEL */}
      <div
        style={{
          padding: 12,
          borderBottom: "1px solid #f3f3f3",
          background: "linear-gradient(180deg,#ffffff,#f8fafc)",
        }}
      >
        <div
          style={{
            border: "1px dashed #e5e7eb",
            borderRadius: 16,
            padding: 14,
            boxShadow: "0 10px 20px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <button
              onClick={toggleVoice}
              disabled={loading || !canUseVoice}
              style={{
                width: 84,
                height: 84,
                borderRadius: 20,
                border: "1px solid #111",
                background: listening ? "#111" : "#fff",
                color: listening ? "#fff" : "#111",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 34,
                display: "grid",
                placeItems: "center",
                boxShadow: "0 14px 30px rgba(0,0,0,0.15)",
                opacity: !canUseVoice ? 0.6 : 1,
              }}
              title={
                !canUseVoice
                  ? "Voice works best in Chrome"
                  : listening
                  ? "Stop listening"
                  : "Tap to speak"
              }
            >
              {listening ? "🎤" : "🎙️"}
            </button>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: 15 }}>
                Speak your business update
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                {canUseVoice
                  ? "Tap the mic to talk hands-free, or hold SPACE to push-to-talk."
                  : "Voice works best in Chrome. You can still type below."}
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {[
                  "I sold 2 rice for 4 dollars each",
                  "I paid gas bill 15 dollars",
                  "I bought 3 bags of beans",
                ].map((t) => (
                  <button
                    key={t}
                    onClick={() => sendMessage(t)}
                    disabled={loading}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      cursor: loading ? "not-allowed" : "pointer",
                      fontSize: 12,
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
            {canUseVoice ? (
              listening ? (
                isSpaceDownRef.current ? (
                  "Push-to-talk: release SPACE to send."
                ) : (
                  "Hands-free: pause to auto-send."
                )
              ) : (
                "Tip: Hold SPACE to talk (release to send)."
              )
            ) : (
              "Voice works best in Chrome."
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        style={{
          padding: 12,
          flex: 1,
          overflowY: "auto",
          background: "#fff",
        }}
      >
        {messages.map((m, idx) => {
          const isUser = m.role === "user";
          return (
            <div
              key={idx}
              style={{
                display: "flex",
                justifyContent: isUser ? "flex-end" : "flex-start",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  maxWidth: "85%",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.25,
                  padding: "10px 12px",
                  borderRadius: 14,
                  background: isUser ? "#111" : "#f4f4f4",
                  color: isUser ? "#fff" : "#111",
                  border: "1px solid " + (isUser ? "#111" : "#eee"),
                }}
              >
                {m.text}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div
        style={{
          padding: 10,
          borderTop: "1px solid #eee",
          display: "flex",
          gap: 8,
          alignItems: "center",
          background: "#fff",
        }}
      >
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            transcriptRef.current = e.target.value;
          }}
          placeholder={listening ? "Listening..." : "Type what happened..."}
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            outline: "none",
          }}
        />

        <button
          onClick={() => sendMessage()}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}


