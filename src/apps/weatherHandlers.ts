// Seeded handler sources for the Weather app's primary action (DATA-03).
//
// The map key is the exact intent string buildActionIntent produces at runtime
// for the weather "search" action. Any mismatch (even whitespace) causes the
// short-circuit to miss and the handler to be produced on demand instead.
//
// The handler source string calls fetchData (the host-brokered data accessor
// injected into the constrained scope by Plan 03) to fetch geocoding data then
// current conditions. It needs ZERO model calls.

// Weather actionSpec — matches the string in seeds.ts exactly (whitespace matters).
// Used to construct the intent key below.
const WEATHER_ACTION_SPEC =
  "State: {query:string, place:string, tempC:number|null, condition:string, status:string}. search: fetch weather for state.query; update place, tempC, condition, status.";

// Intent key: buildActionIntent("weather", WEATHER_ACTION_SPEC, "search")
const WEATHER_SEARCH_INTENT =
  `weather action 'search': ${WEATHER_ACTION_SPEC} ` +
  `The handler input is { state, payload } where payload is the action string 'search'. ` +
  `Return { data: { state } } with the SAME state shape and ALWAYS a valid state.`;

// Handler source string — executed in the constrained new Function scope.
// fetchData is injected as a parameter; input is { state, payload }.
// No import/export syntax — handler() is a bare function declaration.
const WEATHER_SEARCH_HANDLER_SOURCE = `
async function handler(input) {
  var state = (input && input.state) ? input.state : {};
  var query = typeof state.query === "string" ? state.query.trim() : "";

  if (!query) {
    return { data: { state: Object.assign({}, state, { status: "idle" }) } };
  }

  // Step 1: geocode the location name → lat/lng
  var geocodeResult = await fetchData("weather-geocode", {
    name: query,
    count: 1,
    language: "en",
    format: "json",
  });

  if (geocodeResult.error) {
    return { data: { state: Object.assign({}, state, { status: "error" }) } };
  }

  var results = geocodeResult.data && geocodeResult.data.results;
  if (!results || !Array.isArray(results) || results.length === 0) {
    return { data: { state: Object.assign({}, state, { status: "error" }) } };
  }

  var loc = results[0];
  var latitude = loc.latitude;
  var longitude = loc.longitude;
  var locationName = loc.name || query;
  var locationCountry = loc.country || "";

  // Step 2: fetch current conditions for this lat/lng
  var forecastResult = await fetchData("weather-forecast", {
    latitude: latitude,
    longitude: longitude,
    current: "temperature_2m,weather_code,wind_speed_10m",
  });

  if (forecastResult.error) {
    return { data: { state: Object.assign({}, state, { status: "error" }) } };
  }

  var current = forecastResult.data && forecastResult.data.current;
  if (!current) {
    return { data: { state: Object.assign({}, state, { status: "error" }) } };
  }

  var tempC = typeof current.temperature_2m === "number"
    ? Math.round(current.temperature_2m)
    : null;

  var code = typeof current.weather_code === "number" ? current.weather_code : -1;
  var condition;
  if (code === 0) {
    condition = "Clear sky";
  } else if (code === 1) {
    condition = "Mainly clear";
  } else if (code === 2) {
    condition = "Partly cloudy";
  } else if (code === 3) {
    condition = "Overcast";
  } else if (code >= 45 && code <= 48) {
    condition = "Foggy";
  } else if (code >= 51 && code <= 55) {
    condition = "Drizzle";
  } else if (code >= 61 && code <= 65) {
    condition = "Rain";
  } else if (code >= 71 && code <= 75) {
    condition = "Snow";
  } else if (code >= 80 && code <= 82) {
    condition = "Rain showers";
  } else if (code === 95) {
    condition = "Thunderstorm";
  } else {
    condition = "Conditions unavailable";
  }

  var place = locationCountry
    ? locationName + ", " + locationCountry
    : locationName;

  return {
    data: {
      state: Object.assign({}, state, {
        place: place,
        tempC: tempC,
        condition: condition,
        status: "ready",
      }),
    },
  };
}
`;

/**
 * Seeded handler sources for the Weather app.
 * Key: exact buildActionIntent("weather", actionSpec, "search") string.
 * Value: handler source string that calls fetchData to fetch geocoding + forecast.
 */
export const WEATHER_HANDLER_SOURCES: ReadonlyMap<string, string> = new Map([
  [WEATHER_SEARCH_INTENT, WEATHER_SEARCH_HANDLER_SOURCE],
]);
