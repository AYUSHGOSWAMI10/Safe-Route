import { useEffect, useState } from "react";
import RouteCard from "./components/RouteCard.jsx";
import { findRoutes, getLocations } from "./services/routes.js";

const preferences = ["Faster", "Balanced", "Safer"];

export default function App() {
  const [locations, setLocations] = useState([]);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [preference, setPreference] = useState("Balanced");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getLocations()
      .then((items) => {
        setLocations(items);
        if (items.length > 1) {
          setSource(items[0]);
          setDestination(items[items.length - 1]);
        }
      })
      .catch((reason) => setError(reason.message));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await findRoutes({ source, destination, preference: preference.toLowerCase() });
      setResult(data);
    } catch (reason) {
      setResult(null);
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }

  const recommendedRoute = result?.routes.find((route) => route.name === result.recommended);

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/">SafeRoute</a>
        <span className="project-label">College project · MVP</span>
      </header>

      <section className="intro">
        <p className="eyebrow">A DIFFERENT WAY TO THINK ABOUT ROUTES</p>
        <h1>Risk-aware route planning</h1>
        <p>Compare a few possible routes by time, distance, and a sample safety score.</p>
      </section>

      <section className="planner" aria-labelledby="planner-title">
        <h2 id="planner-title">Plan your route</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Starting point
              <select value={source} onChange={(event) => setSource(event.target.value)} required>
                {locations.map((location) => <option key={location}>{location}</option>)}
              </select>
            </label>
            <label>Destination
              <select value={destination} onChange={(event) => setDestination(event.target.value)} required>
                {locations.map((location) => <option key={location}>{location}</option>)}
              </select>
            </label>
          </div>

          <fieldset>
            <legend>Route preference</legend>
            <div className="preference-options">
              {preferences.map((item) => (
                <button
                  className={preference === item ? "preference selected" : "preference"}
                  key={item}
                  onClick={() => setPreference(item)}
                  type="button"
                >{item}</button>
              ))}
            </div>
          </fieldset>

          <button className="submit-button" disabled={loading || locations.length < 2} type="submit">
            {loading ? "Finding routes…" : "Find route"}
          </button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      {result && recommendedRoute && (
        <section className="results" aria-live="polite">
          <div className="results-heading">
            <div><p className="eyebrow">YOUR OPTIONS</p><h2>Route comparison</h2></div>
            <p className="result-caption">{result.source} to {result.destination}</p>
          </div>
          <div className="recommended-summary">
            <div>
              <p className="eyebrow">RECOMMENDED · {preference.toUpperCase()}</p>
              <h3>{recommendedRoute.name}</h3>
            </div>
            <div className="summary-stats">
              <strong>{recommendedRoute.estimatedTime} min</strong><span>time</span>
              <strong>{recommendedRoute.distance} km</strong><span>distance</span>
              <strong>{recommendedRoute.safetyScore}/100</strong><span>safety</span>
            </div>
          </div>
          <div className="route-list">
            {result.routes.map((route) => (
              <RouteCard key={route.name} route={route} recommended={route.name === result.recommended} />
            ))}
          </div>
        </section>
      )}

      <footer>
        Safety scores are estimated using sample data and do not guarantee real-world safety.
      </footer>
    </main>
  );
}
