export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <section
        style={{
          width: "min(100%, 24rem)",
          backgroundColor: "#ffffff",
          borderRadius: "1rem",
          padding: "2rem",
          boxShadow: "0 12px 40px rgba(16, 35, 63, 0.08)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Login</h1>
        <p style={{ marginBottom: 0, color: "#52637a" }}>
          Minimal CRM access screen placeholder.
        </p>
      </section>
    </main>
  );
}
