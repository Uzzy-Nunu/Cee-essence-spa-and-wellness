"use client";

import { FormEvent, useEffect, useState } from "react";

type Message = { role: "user" | "assistant"; text: string };
const welcome = "Welcome to Cee Essence. I’m your wellness concierge. How may I assist you today?";

export function Concierge() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", text: welcome }]);
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem("cee-essence-chat-session");
    const id = stored || window.crypto.randomUUID();
    window.localStorage.setItem("cee-essence-chat-session", id);
    setSessionId(id);
  }, []);

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

  return (
    <div className="concierge">
      <button onClick={() => setOpen(!open)} className="chat-launch" aria-label={open ? "Close concierge" : "Open concierge"} aria-expanded={open}>
        {open ? "×" : "✦"}<span>Concierge</span>
      </button>
      {open && <section className="chat-panel" aria-label="Cee Essence concierge">
        <header><span className="leaf">❦</span><div><b>Cee Essence Concierge</b><small>Here to make your visit effortless</small></div></header>
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
            {messages.map((message, index) => <p className={message.role} key={index}>{message.text}</p>)}
            {busy && <p className="assistant">Considering your request…</p>}
          </div>
          {error && <p className="error chat-error" role="alert">{error}</p>}
          <form onSubmit={send} className="chat-input">
            <input value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} placeholder="Ask about a treatment…" aria-label="Message the concierge" />
            <button aria-label="Send message" disabled={busy || !sessionId || !text.trim()}>→</button>
          </form>
          <button className="handoff-link" onClick={() => { setHandoff(true); setError(""); }}>Would you prefer to speak with our team?</button>
        </>}
      </section>}
    </div>
  );
}
