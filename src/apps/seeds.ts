// Seeded app source strings (Phase 2 + Phase 12).
// These are used as the source on a cache miss instead of a model call.
// Each entry maps an app type id to its TSX source string.
// The exported Map is consulted by the resolver before any network call.
//
// Entries for counter and notes are monolithic React App components.
// Entries for weather and currency are delegated modules (initialState + view + actionSpec)
// that work with the DelegatedShell runtime and seeded handler sources.

// App types whose seeded source is a delegated module (initialState + view +
// actionSpec) rather than a monolithic App component. The loader consults this to
// route them to the DelegatedShell instantiator instead of the monolith path, and
// to persist the correct mode on the cached record. Keep in sync with the entries
// below that end in `module.exports = { initialState, view, actionSpec }`.
export const SEEDED_DELEGATED: ReadonlySet<string> = new Set(["weather", "currency"]);

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
    try {
      const saved = localStorage.getItem("marketplace.notes.items");
      if (saved) setItems(JSON.parse(saved) as string[]);
    } catch {}
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
  [
    "weather",
    `
const initialState = {
  query: "",
  place: "",
  tempC: null,
  condition: "",
  status: "idle",
};

const actionSpec = "State: {query:string, place:string, tempC:number|null, condition:string, status:string}. search: fetch weather for state.query; update place, tempC, condition, status.";

function view(state) {
  const s = state.status;

  if (s === "loading") {
    return (
      <div style={{ padding: "1.5rem", fontFamily: "inherit" }} aria-busy="true">
        <span role="status" style={{ color: "inherit", opacity: 0.7 }}>Loading conditions…</span>
      </div>
    );
  }

  if (s === "error") {
    return (
      <div style={{ padding: "1.5rem", fontFamily: "inherit" }}>
        <p style={{ margin: "0 0 1rem", opacity: 0.7 }}>Couldn’t load conditions</p>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <input
            defaultValue={state.query}
            data-field="query"
            placeholder="Enter a location"
            style={{ flex: 1, padding: "0.5rem 0.75rem", borderRadius: "0.375rem", border: "1px solid currentColor", background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: "0.95rem" }}
          />
          <button
            data-action="search"
            style={{ padding: "0.5rem 1rem", borderRadius: "0.375rem", border: "1px solid currentColor", cursor: "pointer", background: "transparent", color: "inherit" }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (s === "ready") {
    return (
      <div style={{ padding: "1.5rem", fontFamily: "inherit" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 0.25rem" }}>{state.place}</p>
        <p style={{ fontSize: "3rem", fontWeight: "bold", margin: "0 0 0.25rem", lineHeight: 1 }}>
          {state.tempC !== null ? state.tempC + "°C" : "—"}
        </p>
        <p style={{ margin: "0 0 1.25rem", opacity: 0.75 }}>{state.condition}</p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            defaultValue={state.query}
            data-field="query"
            placeholder="Enter a location"
            style={{ flex: 1, padding: "0.5rem 0.75rem", borderRadius: "0.375rem", border: "1px solid currentColor", background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: "0.95rem" }}
          />
          <button
            data-action="search"
            style={{ padding: "0.5rem 1rem", borderRadius: "0.375rem", border: "1px solid currentColor", cursor: "pointer", background: "transparent", color: "inherit" }}
          >
            Search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem", fontFamily: "inherit" }}>
      <p style={{ margin: "0 0 1rem", opacity: 0.7 }}>Enter a location</p>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          defaultValue={state.query}
          data-field="query"
          placeholder="Enter a location"
          style={{ flex: 1, padding: "0.5rem 0.75rem", borderRadius: "0.375rem", border: "1px solid currentColor", background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: "0.95rem" }}
        />
        <button
          data-action="search"
          style={{ padding: "0.5rem 1rem", borderRadius: "0.375rem", border: "1px solid currentColor", cursor: "pointer", background: "transparent", color: "inherit" }}
        >
          Search
        </button>
      </div>
    </div>
  );
}

module.exports = { initialState, view, actionSpec };
`,
  ],
  [
    "currency",
    `
const initialState = {
  base: "USD",
  rates: null,
  status: "idle",
};

const actionSpec = "State: {base:string, rates:object|null, status:string}. load: fetch exchange rates for state.base; update rates, status.";

function view(state) {
  const s = state.status;

  if (s === "loading") {
    return (
      <div style={{ padding: "1.5rem", fontFamily: "inherit" }} aria-busy="true">
        <span role="status" style={{ color: "inherit", opacity: 0.7 }}>Loading rates…</span>
      </div>
    );
  }

  if (s === "error") {
    return (
      <div style={{ padding: "1.5rem", fontFamily: "inherit" }}>
        <p style={{ margin: "0 0 1rem", opacity: 0.7 }}>Couldn’t load rates</p>
        <button
          data-action="load"
          style={{ padding: "0.5rem 1rem", borderRadius: "0.375rem", border: "1px solid currentColor", cursor: "pointer", background: "transparent", color: "inherit" }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (s === "ready" && state.rates && typeof state.rates === "object") {
    const entries = Object.entries(state.rates);
    return (
      <div style={{ padding: "1.5rem", fontFamily: "inherit" }}>
        <p style={{ margin: "0 0 0.75rem", fontWeight: 600 }}>1 {state.base} =</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.25rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          {entries.map(([code, rate]) => (
            <li key={code} style={{ display: "flex", justifyContent: "space-between", padding: "0.375rem 0.5rem", borderRadius: "0.25rem", border: "1px solid currentColor", opacity: 0.85 }}>
              <span style={{ fontWeight: 500 }}>{code}</span>
              <span>{typeof rate === "number" ? rate.toFixed(4) : String(rate)}</span>
            </li>
          ))}
        </ul>
        <button
          data-action="load"
          style={{ padding: "0.375rem 0.75rem", borderRadius: "0.375rem", border: "1px solid currentColor", cursor: "pointer", background: "transparent", color: "inherit", fontSize: "0.875rem" }}
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem", fontFamily: "inherit" }}>
      <p style={{ margin: "0 0 1rem", opacity: 0.7 }}>Base currency: {state.base}</p>
      <button
        data-action="load"
        style={{ padding: "0.5rem 1rem", borderRadius: "0.375rem", border: "1px solid currentColor", cursor: "pointer", background: "transparent", color: "inherit" }}
      >
        Load rates
      </button>
    </div>
  );
}

module.exports = { initialState, view, actionSpec };
`,
  ],
]);
