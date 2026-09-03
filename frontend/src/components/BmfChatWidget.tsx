import { useEffect, useRef, useState } from "react";

type Mensaje = { role: "user" | "assistant"; content: string };

const ROJO = "#d0021b";
const ROJO_OSCURO = "#a00215";
const OSCURO = "#1c1c1c";

const SALUDO: Mensaje = {
  role: "assistant",
  content:
    "Hi! I'm Jennifer, your funding assistant at Business Market Finders. Ask me anything about funding — I'll keep it short. What would you like to know?",
};

export function BmfChatWidget() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([SALUDO]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, enviando]);

  // Permite abrir el chat desde cualquier parte (ej. botones "Chat with Jennifer"
  // de la landing) disparando el evento `bmf:open-chat`.
  useEffect(() => {
    function abrir() {
      setAbierto(true);
    }
    window.addEventListener("bmf:open-chat", abrir);
    return () => window.removeEventListener("bmf:open-chat", abrir);
  }, []);

  async function enviar() {
    const contenido = texto.trim();
    if (!contenido || enviando) return;

    const historial: Mensaje[] = [...mensajes, { role: "user", content: contenido }];
    setMensajes(historial);
    setTexto("");
    setEnviando(true);

    try {
      const resp = await fetch("/api/public/bmf-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historial }),
      });

      if (!resp.ok) {
        const err = (await resp.json().catch(() => null)) as { error?: string } | null;
        setMensajes((prev) => [
          ...prev,
          { role: "assistant", content: err?.error ?? "I could not answer right now. Please try again." },
        ]);
        return;
      }

      const datos = (await resp.json()) as { reply?: string };
      setMensajes((prev) => [...prev, { role: "assistant", content: datos.reply ?? "" }]);
    } catch {
      setMensajes((prev) => [
        ...prev,
        { role: "assistant", content: "I could not reach the assistant. Please try again in a moment." },
      ]);
    } finally {
      setEnviando(false);
    }
  }

  // Detecta un applicationId (BMF-AAAA-NNNNNN) en el historial para mostrar confirmación.
  const appId = [...mensajes].reverse().find((m) => /\bBMF-\d{4}-\d{6}\b/.test(m.content));

  return (
    <>
      <style>{`@keyframes bmfPulse { 0%,60%,100% { opacity: 0.25; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }`}</style>
      {abierto && (
        <div
          style={{
            position: "fixed",
            right: 24,
            bottom: 96,
            width: 360,
            maxWidth: "calc(100vw - 32px)",
            height: 520,
            maxHeight: "calc(100vh - 120px)",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#fff",
            borderRadius: 16,
            boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
            overflow: "hidden",
            zIndex: 9999,
            fontFamily: "'Montserrat', system-ui, sans-serif",
            border: "1px solid #ececec",
          }}
        >
          {/* Header */}
          <div style={{ backgroundColor: ROJO, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                gridArea: "auto",
                display: "grid",
                placeItems: "center",
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: "rgba(255,255,255,0.16)",
                color: "#fff",
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              BMF
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}>Jennifer</div>
              <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 11.5 }}>Business Market Finders</div>
            </div>
            <button
              onClick={() => setAbierto(false)}
              aria-label="Close chat"
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                fontSize: 22,
                lineHeight: 1,
                cursor: "pointer",
                padding: "0 2px",
              }}
            >
              ×
            </button>
          </div>

          {/* Mensajes */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", backgroundColor: "#f6f6f6" }}>
            {mensajes.map((m, i) => {
              const propio = m.role === "user";
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: propio ? "flex-end" : "flex-start",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "82%",
                      padding: "10px 14px",
                      borderRadius: propio ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      backgroundColor: propio ? ROJO : "#fff",
                      color: propio ? "#fff" : OSCURO,
                      fontSize: 14,
                      lineHeight: 1.45,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      boxShadow: propio ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
                      border: propio ? "none" : "1px solid #ececec",
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })}

            {enviando && (
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
                <div
                  style={{
                    backgroundColor: "#fff",
                    border: "1px solid #ececec",
                    borderRadius: "16px 16px 16px 4px",
                    padding: "12px 16px",
                    display: "flex",
                    gap: 5,
                  }}
                >
                  <Dot /> <Dot delay={0.15} /> <Dot delay={0.3} />
                </div>
              </div>
            )}

            {appId && (
              <div
                style={{
                  margin: "4px 0 6px",
                  padding: "10px 14px",
                  borderRadius: 12,
                  backgroundColor: "#f0fbf2",
                  border: "1px solid #bde3c4",
                  color: "#1c7a2e",
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                ✓ Application submitted — the BMF team will contact you by email.
              </div>
            )}

            <div ref={finRef} />
          </div>

          {/* Input */}
          <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #ececec", backgroundColor: "#fff" }}>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              placeholder="Type your question…"
              disabled={enviando}
              style={{
                flex: 1,
                border: "1px solid #d9d9d9",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 14,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={enviar}
              disabled={enviando || !texto.trim()}
              style={{
                backgroundColor: ROJO,
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "0 16px",
                fontWeight: 700,
                fontSize: 14,
                cursor: enviando || !texto.trim() ? "not-allowed" : "pointer",
                opacity: enviando || !texto.trim() ? 0.5 : 1,
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Botón flotante */}
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-label="Chat with the funding assistant"
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          width: 60,
          height: 60,
          borderRadius: "50%",
          backgroundColor: ROJO,
          border: "none",
          cursor: "pointer",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 10px 26px rgba(208,2,27,0.42)",
          zIndex: 9999,
          transition: "transform 0.12s ease, background-color 0.12s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ROJO_OSCURO)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ROJO)}
      >
        {abierto ? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        )}
      </button>
    </>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        backgroundColor: "#b8b8b8",
        animation: "bmfPulse 1.1s ease-in-out infinite",
        animationDelay: `${delay}s`,
      }}
    />
  );
}
