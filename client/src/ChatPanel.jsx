import { useEffect, useRef, useState } from "react";

export default function ChatPanel({ title, subtitle, messages, onSend, onClose, sending, placeholder }) {
  const [text, setText] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div>
          <div className="chat-title">{title}</div>
          {subtitle && <div className="chat-subtitle">{subtitle}</div>}
        </div>
        {onClose && (
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
      </div>
      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && <div className="chat-empty">No messages yet. Say hello.</div>}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}`}>
            {m.content}
          </div>
        ))}
        {sending && <div className="chat-bubble chat-bubble-ai chat-typing">…</div>}
      </div>
      <form className="chat-input-row" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder || "Type a message…"}
          disabled={sending}
        />
        <button type="submit" disabled={sending || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
