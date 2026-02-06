export default function HomePage() {
  return (
    <main
      style={{
        padding: 24,
        maxWidth: 980,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          border: "1px solid #E6E8EE",
          borderRadius: 18,
          padding: 22,
          background: "#fff",
          boxShadow: "0 12px 28px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 16,
              background: "#E9F2FF",
              border: "1px solid #E6E8EE",
              display: "grid",
              placeItems: "center",
              fontWeight: 900,
              color: "#1F6FEB",
            }}
          >
            A
          </div>

          <div>
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.15 }}>
              Adora Ops
            </h1>
            <p style={{ margin: "6px 0 0", color: "#5B6475" }}>
              Simple operations for small businesses — track products, inventory,
              sales, and expenses, and log everything by chat or voice.
            </p>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          <div style={card()}>
            <div style={cardTitle()}>Chat-first logging</div>
            <div style={cardBody()}>
              “I sold 2 rice for $4 each” → sales + inventory updates instantly.
            </div>
          </div>

          <div style={card()}>
            <div style={cardTitle()}>Voice mode</div>
            <div style={cardBody()}>
              Hands-free logging: click mic or hold SPACE to talk.
            </div>
          </div>

          <div style={card()}>
            <div style={cardTitle()}>Real-time dashboard</div>
            <div style={cardBody()}>
              Paid vs unpaid revenue, top sellers, and profit views.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a
            href="/login"
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              background: "#1F6FEB",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 800,
              border: "1px solid #1F6FEB",
            }}
          >
            Get started
          </a>

          <a
            href="/dashboard"
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              background: "#fff",
              color: "#0B1220",
              textDecoration: "none",
              fontWeight: 800,
              border: "1px solid #E6E8EE",
            }}
          >
            Go to dashboard
          </a>
        </div>
      </div>

      <p style={{ marginTop: 14, color: "#5B6475", fontSize: 13 }}>
        Built for small teams who want fast, accurate tracking without complex tools.
      </p>
    </main>
  );
}

function card(): React.CSSProperties {
  return {
    border: "1px solid #E6E8EE",
    borderRadius: 16,
    padding: 14,
    background: "#F7F9FC",
  };
}
function cardTitle(): React.CSSProperties {
  return { fontWeight: 900, marginBottom: 6, color: "#0B1220" };
}
function cardBody(): React.CSSProperties {
  return { color: "#5B6475", fontSize: 14, lineHeight: 1.3 };
}


