// Seeded handler sources for the Currency app's primary action (DATA-03).
//
// The map key is the exact intent string buildActionIntent produces at runtime
// for the currency "load" action. Any mismatch (even whitespace) causes the
// fallback cache path to be used.
//
// The handler source calls fetchData to fetch live FX rates and maps the
// response to the view's state fields (base, rates, status).

// Currency actionSpec — matches the string in seeds.ts exactly (whitespace matters).
const CURRENCY_ACTION_SPEC =
  "State: {base:string, rates:object|null, status:string}. load: fetch exchange rates for state.base; update rates, status.";

// Intent key: buildActionIntent("currency", CURRENCY_ACTION_SPEC, "load")
const CURRENCY_LOAD_INTENT =
  `currency action 'load': ${CURRENCY_ACTION_SPEC} ` +
  `The handler input is { state, payload } where payload is the action string 'load'. ` +
  `Return { data: { state } } with the SAME state shape and ALWAYS a valid state.`;

// Handler source string — executed in the constrained new Function scope.
// fetchData is injected as a parameter; input is { state, payload }.
const CURRENCY_LOAD_HANDLER_SOURCE = `
async function handler(input) {
  var state = (input && input.state) ? input.state : {};
  var base = typeof state.base === "string" && state.base ? state.base : "USD";

  var result = await fetchData("fx-latest", { base: base });

  if (result.error) {
    return { data: { state: Object.assign({}, state, { status: "error" }) } };
  }

  var rates = result.data && result.data.rates;
  if (!rates || typeof rates !== "object") {
    return { data: { state: Object.assign({}, state, { status: "error" }) } };
  }

  return {
    data: {
      state: Object.assign({}, state, {
        base: base,
        rates: rates,
        status: "ready",
      }),
    },
  };
}
`;

/**
 * Seeded handler sources for the Currency app.
 * Key: exact buildActionIntent("currency", actionSpec, "load") string.
 * Value: handler source string that calls fetchData to fetch FX rates.
 */
export const CURRENCY_HANDLER_SOURCES: ReadonlyMap<string, string> = new Map([
  [CURRENCY_LOAD_INTENT, CURRENCY_LOAD_HANDLER_SOURCE],
]);
