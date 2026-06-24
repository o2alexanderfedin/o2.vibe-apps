// Seeded app source strings (Phase 2).
// These are used as the source on a cache miss instead of a model call.
// Each entry maps an app type id to its TSX source string.
// The exported Map is consulted by the resolver before any network call.

export const SEEDED_SOURCES: ReadonlyMap<string, string> = new Map([
  [
    "counter",
    `
function App() {
  const [count, setCount] = React.useState(0);
  return (
    <div style={{ padding: "1.5rem", textAlign: "center", fontFamily: "inherit" }}>
      <p style={{ fontSize: "3rem", fontWeight: "bold", margin: "0 0 1rem" }}>{count}</p>
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
        <button
          onClick={() => setCount(c => c - 1)}
          style={{ padding: "0.5rem 1.25rem", fontSize: "1.25rem", borderRadius: "0.375rem", border: "1px solid currentColor", cursor: "pointer", background: "transparent", color: "inherit" }}
        >
          −
        </button>
        <button
          onClick={() => setCount(0)}
          style={{ padding: "0.5rem 1.25rem", fontSize: "1rem", borderRadius: "0.375rem", border: "1px solid currentColor", cursor: "pointer", background: "transparent", color: "inherit" }}
        >
          Reset
        </button>
        <button
          onClick={() => setCount(c => c + 1)}
          style={{ padding: "0.5rem 1.25rem", fontSize: "1.25rem", borderRadius: "0.375rem", border: "1px solid currentColor", cursor: "pointer", background: "transparent", color: "inherit" }}
        >
          +
        </button>
      </div>
    </div>
  );
}
`,
  ],
  [
    "notes",
    `
function App() {
  const [items, setItems] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState("");

  React.useEffect(() => {
    const saved = localStorage.getItem("marketplace.notes.items");
    if (saved) {
      try { setItems(JSON.parse(saved) as string[]); } catch {}
    }
  }, []);

  const persist = (next: string[]) => {
    setItems(next);
    try { localStorage.setItem("marketplace.notes.items", JSON.stringify(next)); } catch {}
  };

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    persist([trimmed, ...items]);
    setDraft("");
  };

  const remove = (idx: number) => persist(items.filter((_, i) => i !== idx));

  return (
    <div style={{ padding: "1rem", fontFamily: "inherit", maxWidth: "28rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Add a note…"
          style={{ flex: 1, padding: "0.5rem 0.75rem", borderRadius: "0.375rem", border: "1px solid currentColor", background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: "0.95rem" }}
        />
        <button
          onClick={add}
          style={{ padding: "0.5rem 1rem", borderRadius: "0.375rem", border: "1px solid currentColor", cursor: "pointer", background: "transparent", color: "inherit" }}
        >
          Add
        </button>
      </div>
      {items.length === 0 && (
        <p style={{ opacity: 0.5, textAlign: "center", marginTop: "2rem" }}>No notes yet.</p>
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {items.map((item, idx) => (
          <li key={idx} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", borderRadius: "0.375rem", border: "1px solid currentColor", opacity: 0.9 }}>
            <span style={{ flex: 1 }}>{item}</span>
            <button
              onClick={() => remove(idx)}
              aria-label="Remove"
              style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.5, fontSize: "1rem", lineHeight: 1, padding: "0.125rem 0.25rem" }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
`,
  ],
]);
