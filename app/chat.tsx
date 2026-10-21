"use client";

import { FormEvent, useEffect, useRef, useState, Fragment } from "react";

type Message = { role: "user" | "assistant"; text: string };
const welcome = "Welcome to Cee Essence. I’m your wellness concierge.\n\nHow may I assist you today? You can ask about treatments, check availability, book an appointment, or speak with our team.";

function FormattedMessage({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  function flushList() {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`}>
          {currentList.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      currentList = [];
    }
  }

  function renderInline(str: string) {
    // Render bold markdown **text**
    const parts = str.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return <Fragment key={i}>{part}</Fragment>;
    });
  }

  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }

    // Check for bullet lines (*, -, •, 1.)
    const bulletMatch = line.match(/^([*\-•]|\d+\.)\s+(.+)$/);
    if (bulletMatch) {
      currentList.push(bulletMatch[2]);
    } else {
      flushList();
      elements.push(<p key={`p-${i}`}>{renderInline(line)}</p>);
    }
  });

  flushList();

  return <>{elements}</>;
}

export function Concierge() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", text: welcome }]);
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("cee-essence-chat-session");
    const id = stored || window.crypto.randomUUID();
    window.localStorage.setItem("cee-essence-chat-session", id);
    setSessionId(id);
  }, []);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, busy, open]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || busy || !sessionId) return;
    const message = text.trim();
    setText("");
    setError("");
    setMessages((current) => [...current, { role: "user", text: message }]);
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The concierge is temporarily unavailable.");
      setMessages((current) => [...current, { role: "assistant", text: data.reply }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send your message.");
    } finally {
      setBusy(false);
    }
  }

  async function requestHandoff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: form.get("name"),
          client_email: form.get("email"),
          client_phone: form.get("phone"),
          message: form.get("message"),
          source: "chatbot",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "We could not send your request.");
      setSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We could not send your request.");
    } finally {
      setBusy(false);
    }
  }

function AvatarBubbleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    >
      {/* Circular avatar bubble body with tail beneath */}
      <path
        d="M12 2C6.75 2 2.5 6.25 2.5 11.5C2.5 13.6 3.18 15.53 4.34 17.1L3 21.5L7.65 20.25C8.98 20.9 10.45 21.3 12 21.3C17.25 21.3 21.5 17.05 21.5 11.8C21.5 6.55 17.25 2 12 2Z"
        fill="rgba(201, 164, 99, 0.22)"
        stroke="var(--gold)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Avatar Head */}
      <circle cx="12" cy="9.2" r="2.7" fill="var(--gold)" />
      {/* Avatar Shoulders */}
      <path
        d="M7.2 17C7.6 14.2 9.5 13.3 12 13.3C14.5 13.3 16.4 14.2 16.8 17"
        stroke="var(--gold)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

  function handleQuickPrompt(promptText: string) {
    if (busy) return;
    setText("");
    setError("");
    setMessages((current) => [...current, { role: "user", text: promptText }]);
    setBusy(true);

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: promptText, sessionId }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "The concierge is temporarily unavailable.");
        setMessages((current) => [...current, { role: "assistant", text: data.reply }]);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to send your message.");
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <div className="concierge">
      <button
        onClick={() => setOpen(!open)}
        className="chat-launch"
        aria-label={open ? "Close Ask Cee" : "Open Ask Cee"}
        aria-expanded={open}
      >
        {open ? <span style={{ fontSize: "16px", lineHeight: 1, display: "inline-flex", alignItems: "center" }}>✕</span> : <AvatarBubbleIcon />}
        <span>Ask Cee</span>
      </button>
      {open && <section className="chat-panel" aria-label="Ask Cee wellness concierge">
        <header>
          <span className="leaf">❦</span>
          <div style={{ flex: 1 }}>
            <b>Ask Cee · Concierge</b>
            <small>Here to make your visit effortless</small>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{ background: "none", border: 0, fontSize: "16px", color: "var(--olive)", cursor: "pointer", padding: 4 }}
            aria-label="Close chat"
          >
            ✕
          </button>
        </header>
        {handoff ? <div className="handoff">
          {sent ? <><h3>We’ll be in touch.</h3><p>A member of our team will follow up directly using your details.</p></> : <form onSubmit={requestHandoff}>
            <h3>Speak with our team</h3><p>Leave your details and message; we’ll respond directly.</p>
            <input name="name" required maxLength={120} placeholder="Your name" />
            <input name="email" required maxLength={254} type="email" placeholder="Email address" />
            <input name="phone" required maxLength={40} placeholder="Phone number" />
            <textarea name="message" required maxLength={2000} placeholder="How can we help?" />
            <button className="button" disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
          </form>}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="text-button" onClick={() => { setHandoff(false); setError(""); }}>Return to concierge</button>
        </div> : <>
          <div className="chat-messages" aria-live="polite">
            {messages.map((message, index) => (
              <div className={`msg-bubble ${message.role}`} key={index}>
                <FormattedMessage text={message.text} />
              </div>
            ))}
            {busy && (
              <div className="msg-bubble assistant typing-bubble" aria-label="Ask Cee is typing">
                <div className="typing-spinner-ring" />
                <span className="typing-label">Typing</span>
                <span className="typing-dots">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick action suggestion chips for effortless mobile/tablet interaction */}
          <div className="chat-suggestions" aria-label="Suggested prompts">
            <button
              type="button"
              className="chat-chip-btn"
              onClick={() => handleQuickPrompt("What treatments are available?")}
            >
              🌿 View Menu
            </button>
            <button
              type="button"
              className="chat-chip-btn"
              onClick={() => handleQuickPrompt("I would like to book an appointment.")}
            >
              📅 Book Session
            </button>
            <button
              type="button"
              className="chat-chip-btn"
              onClick={() => handleQuickPrompt("What are your booking and deposit policies?")}
            >
              📜 Spa Policies
            </button>
          </div>

          {error && <p className="error chat-error" role="alert">{error}</p>}
          <form onSubmit={send} className="chat-input">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={1000}
              placeholder="Ask about a treatment or book…"
              aria-label="Message the concierge"
            />
            <button aria-label="Send message" disabled={busy || !sessionId || !text.trim()}>→</button>
          </form>
          <button className="handoff-link" onClick={() => { setHandoff(true); setError(""); }}>Would you prefer to speak with our team?</button>
        </>}
      </section>}
    </div>
  );
}
