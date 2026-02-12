"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  onFinalText: (text: string) => void;
  disabled?: boolean;
  autoStopMs?: number; // default 3 mins
};

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

export default function VoiceMic({ onFinalText, disabled, autoStopMs = 3 * 60 * 1000 }: Props) {
  const [isListening, setIsListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<any>(null);
  const lastHeardAtRef = useRef<number>(Date.now());
  const inactivityTimerRef = useRef<any>(null);

  const supported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }, []);

  function clearTimer() {
    if (inactivityTimerRef.current) {
      clearInterval(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }

  function startTimerStopOnInactivity() {
    clearTimer();
    inactivityTimerRef.current = setInterval(() => {
      if (!recRef.current) return;
      const idle = Date.now() - lastHeardAtRef.current;
      if (idle >= autoStopMs) {
        stop();
      }
    }, 1000);
  }

  function start() {
    if (!supported || disabled) return;

    setError(null);
    setPartial("");

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    recRef.current = rec;

    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onstart = () => {
      lastHeardAtRef.current = Date.now();
      setIsListening(true);
      startTimerStopOnInactivity();
    };

    rec.onerror = (e: any) => {
      setError(e?.error || "Voice error");
      stop();
    };

    rec.onend = () => {
      clearTimer();
      setIsListening(false);
    };

    rec.onresult = (event: any) => {
      lastHeardAtRef.current = Date.now();

      let interim = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = String(result?.[0]?.transcript || "").trim();
        if (!text) continue;

        if (result.isFinal) finalText += (finalText ? " " : "") + text;
        else interim += (interim ? " " : "") + text;
      }

      if (interim) setPartial(interim);

      if (finalText) {
        setPartial("");
        onFinalText(finalText);
      }
    };

    try {
      rec.start();
    } catch (e: any) {
      setError(e?.message || "Could not start mic");
      stop();
    }
  }

  function stop() {
    clearTimer();
    const rec = recRef.current;
    recRef.current = null;

    try {
      if (rec) rec.stop();
    } catch {}
    setIsListening(false);
  }

  useEffect(() => {
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        style={{
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid #E6E8EE",
          background: "#fff",
          fontWeight: 900,
          opacity: 0.6,
        }}
        title="Speech recognition not supported in this browser"
      >
        🎤
      </button>
    );
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <button
        type="button"
        onClick={() => (isListening ? stop() : start())}
        disabled={disabled}
        style={{
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid #E6E8EE",
          background: isListening ? "#111" : "#fff",
          color: isListening ? "#fff" : "#111",
          fontWeight: 1000,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        title={isListening ? "Tap to stop" : "Tap to speak"}
      >
        {isListening ? "⏹ Stop" : "🎤 Speak"}
      </button>

      {isListening ? (
        <div style={{ fontSize: 12, color: "#5B6475" }}>
          Listening… {partial ? <span>“{partial}”</span> : <span>(say something)</span>}
          <div style={{ marginTop: 2, opacity: 0.8 }}>Auto-stops after 3 minutes of silence.</div>
        </div>
      ) : null}

      {error ? <div style={{ fontSize: 12, color: "#B91C1C" }}>{error}</div> : null}
    </div>
  );
}
