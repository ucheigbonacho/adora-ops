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

export default function AssistantWidget() {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      text:
        "Hi! Tell me what happened today.\n\n" +
        "Examples:\n" +
        "• I sold 2 rice for 4 dollars each\n" +
        "• I paid gas bill 15 dollars\n" +
        "• I bought 3 bags of beans\n\n" +
        "You can also ask:\n" +
        "• did i make profit today?\n" +
        "• did i make profit this month?\n" +
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

  // Cleanup
  useEffect(() => {
    return () => {
      try {
        if (recRef.current) recRef.current.abort?.();
      } catch {}
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  async function sendToApi(textToSend: string) {
    const text = String(textToSend || "").trim();
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

  async function sendMessage() {
    const text = input.trim();
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
      const replyText = String(data?.reply || "Done ✅").trim();
      setMessages((m) => [...m, { role: "assistant", text: replyText }]);
      window.dispatchEvent(new Event("adora:refresh"));
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
          "Tell me what happened today.\n\n" +
          "Examples:\n" +
          "• I sold 2 rice for 4 dollars each\n" +
          "• I paid gas bill 15 dollars\n" +
          "• I bought 3 bags of beans\n\n" +
          "You can also ask:\n" +
          "• did i make profit today?\n" +
          "• did i make profit this month?\n" +
          "• top selling products today\n" +
          "• paid vs unpaid revenue",
      },
    ]);
    setInput("");
    transcriptRef.current = "";
  }

  // =========================================================
  // VOICE
  // =========================================================
  function stopListening() {
    if (!recRef.current) return;
    try {
      recRef.current.stop?.();
    } catch {}
  }

  async function sendSpokenText(spoken: string) {
    const text = String(spoken || "").trim();
    if (!text) return;

    setInput("");
    transcriptRef.current = "";
    setLoading(true);
    setMessages((m) => [...m, { role: "user", text }]);

    try {
      const data = await sendToApi(text);
      const replyText = String(data?.reply || "Done ✅").trim();
      setMessages((m) => [...m, { role: "assistant", text: replyText }]);
      window.dispatchEvent(new Event("adora:refresh"));
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `I ran into an error: ${safeErrMsg(e)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function startListeningHandsFree() {
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
      // if user is holding SPACE, do NOT auto-stop on silence
      if (isSpaceDownRef.current) return;

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        stopListening();
      }, 1300);
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

      const spoken = (transcriptRef.current || "").trim() || finalText.trim();
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
      alert("Voice input not supported on this browser. Use Chrome.");
      return;
    }
    if (loading) return;

    if (listening) stopListening();
    else startListeningHandsFree();
  }

  // SPACEBAR push-to-talk
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const isTyping =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          (el as any).isContentEditable);

      if (isTyping) return;

      if (e.code === "Space") {
        e.preventDefault();

        if (loading) return;
        if (!canUseVoice) return;

        if (isSpaceDownRef.current) return;
        isSpaceDownRef.current = true;

        if (!listening) {
          transcriptRef.current = "";
          setInput("");
          startListeningHandsFree();
        }
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const isTyping =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          (el as any).isContentEditable);

      if (isTyping) return;

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

  // UI
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
          border: "1px solid #E6E8EE",
          background: "#0B1220",
          color: "#fff",
          cursor: "pointer",
          fontWeight: 900,
        }}
        title="Open Adora"
      >
        Adora
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        width: 360,
        height: 520,
        zIndex: 9999,
        border: "1px solid #E6E8EE",
        borderRadius: 18,
        background: "#fff",
        boxShadow: "0 12px 28px rgba(0,0,0,0.12)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid #F0F2F6",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          background: "#F7F9FC",
        }}
      >
        <div style={{ fontWeight: 950 }}>
          Adora{userName ? ` • ${userName}` : ""}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={clearChat}
            style={{
              padding: "6px 10px",
              borderRadius: 12,
              border: "1px solid #E6E8EE",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Clear
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              padding: "6px 10px",
              borderRadius: 12,
              border: "1px solid #E6E8EE",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Close
          </button>
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
                  borderRadius: 16,
                  background: isUser ? "#0B1220" : "#F4F6FA",
                  color: isUser ? "#fff" : "#0B1220",
                  border: "1px solid " + (isUser ? "#0B1220" : "#E6E8EE"),
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
          borderTop: "1px solid #F0F2F6",
          display: "flex",
          gap: 10,
          alignItems: "center",
          background: "#fff",
        }}
      >
        {/* ✅ BIG MIC (permanent) */}
        <button
          onClick={toggleVoice}
          disabled={!canUseVoice || loading}
          title={
            !canUseVoice
              ? "Voice not supported in this browser"
              : listening
              ? "Stop listening"
              : "Start voice"
          }
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            border: "1px solid #E6E8EE",
            background: listening ? "#111827" : "#1F6FEB",
            color: "#fff",
            cursor: !canUseVoice || loading ? "not-allowed" : "pointer",
            display: "grid",
            placeItems: "center",
            fontSize: 24,
            boxShadow: listening
              ? "0 0 0 6px rgba(31,111,235,0.18)"
              : "0 10px 20px rgba(0,0,0,0.10)",
          }}
        >
          🎤
        </button>

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
            padding: "12px 12px",
            borderRadius: 14,
            border: "1px solid #E6E8EE",
            outline: "none",
          }}
        />

        <button
          onClick={sendMessage}
          disabled={loading}
          style={{
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid #0B1220",
            background: "#0B1220",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 900,
          }}
        >
          {loading ? "..." : "Send"}
        </button>
      </div>

      {/* Footer hint */}
      <div
        style={{
          padding: "6px 10px",
          fontSize: 12,
          color: "#5B6475",
          borderTop: "1px solid #F3F5F9",
          background: "#FCFCFD",
        }}
      >
        {canUseVoice ? (
          listening ? (
            isSpaceDownRef.current ? (
              "Push-to-talk: release SPACE to send."
            ) : (
              "Hands-free: pause to auto-send."
            )
          ) : (
            "Tip: Click 🎤 or hold SPACE to talk (release to send)."
          )
        ) : (
          "Voice works best in Chrome."
        )}
      </div>
    </div>
  );
}



