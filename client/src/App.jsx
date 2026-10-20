import { useEffect, useState } from "react";
import RouteCard from "./components/RouteCard.jsx";
import { findRoutes, getLocations } from "./services/routes.js";
import { signup, login, getMe } from "./services/auth.js";

const preferences = ["Faster", "Balanced", "Safer"];
const TOKEN_KEY = "saferoute_token";

export default function App() {
  const [locations, setLocations] = useState([]);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [preference, setPreference] = useState("Balanced");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [authMode, setAuthMode] = useState("login");
  const [token, setToken] = useState(
    () => sessionStorage.getItem(TOKEN_KEY) || ""
  );
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");

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

  useEffect(() => {
    let active = true;

    if (!token) {
      setAuthLoading(false);
      return () => {
        active = false;
      };
    }

    getMe(token)
      .then((profile) => {
        if (active) setUser(profile);
      })
      .catch(() => {
        sessionStorage.removeItem(TOKEN_KEY);
        if (active) {
          setToken("");
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");
    setAuthLoading(true);

    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");

    try {
      let data;

      if (authMode === "signup") {
        const name = form.get("name");
        data = await signup({ name, email, password });
      } else {
        data = await login({ email, password });
      }

      sessionStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
      setToken(data.token);
      setAuthMessage("");
    } catch (reason) {
      setAuthError(reason.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
    setResult(null);
    setAuthError("");
    setAuthMessage("You have been logged out.");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await findRoutes({
        source,
        destination,
        preference: preference.toLowerCase(),
      });
      setResult(data);
    } catch (reason) {
      setResult(null);
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }

  const recommendedRoute = result?.routes.find(
    (route) => route.name === result.recommended
  );

  if (authLoading && token && !user) {
    return (
      <main className="page-shell">
        <p>Checking your account...</p>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/">SafeRoute</a>
        {user ? (
          <div className="account-bar">
            <span className="project-label">Hi, {user.name}</span>
            <button className="text-button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        ) : (
          <span className="project-label">College project · MVP</span>
        )}
      </header>

      {!user ? (
        <>
          <section className="intro">
            <p className="eyebrow">WELCOME TO SAFEROUTE</p>
            <h1>Travel with more confidence</h1>
            <p>Create an account or log in to access your route planner.</p>
          </section>

          <section className="planner auth-panel">
            <div className="auth-tabs">
              <button
                type="button"
                className={authMode === "login" ? "auth-tab active" : "auth-tab"}
                onClick={() => {
                  setAuthMode("login");
                  setAuthError("");
                  setAuthMessage("");
                }}
              >
                Login
              </button>
              <button
                type="button"
                className={authMode === "signup" ? "auth-tab active" : "auth-tab"}
                onClick={() => {
                  setAuthMode("signup");
                  setAuthError("");
                  setAuthMessage("");
                }}
              >
                Sign up
              </button>
            </div>

            <h2>{authMode === "login" ? "Welcome back" : "Create your account"}</h2>

            <form onSubmit={handleAuthSubmit}>
              {authMode === "signup" && (
                <label className="auth-field">
                  Full name
                  <input
                    name="name"
                    type="text"
                    minLength={2}
                    maxLength={80}
                    autoComplete="name"
                    required
                  />
                </label>
              )}

              <label className="auth-field">
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="auth-field">
                Password
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  maxLength={72}
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  required
                />
              </label>

              {authError && <p className="error" role="alert">{authError}</p>}
              {authMessage && <p role="status">{authMessage}</p>}

              <button className="submit-button" type="submit" disabled={authLoading}>
                {authLoading
                  ? "Please wait..."
                  : authMode === "login"
                    ? "Log in"
                    : "Create account"}
              </button>
            </form>

            <p className="auth-switch">
              {authMode === "login"
                ? "New to SafeRoute?"
                : "Already have an account?"}{" "}
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setAuthMode(authMode === "login" ? "signup" : "login");
                  setAuthError("");
                  setAuthMessage("");
                }}
              >
                {authMode === "login" ? "Sign up" : "Log in"}
              </button>
            </p>
          </section>
        </>
      ) : (
        <>
          <section className="intro">
            <p className="eyebrow">A DIFFERENT WAY TO THINK ABOUT ROUTES</p>
            <h1>Risk-aware route planning</h1>
            <p>Compare possible routes by time, distance, and a sample safety score.</p>
          </section>

          <section className="planner" aria-labelledby="planner-title">
            <h2 id="planner-title">Plan your route</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <label>
                  Starting point
                  <select value={source} onChange={(event) => setSource(event.target.value)} required>
                    {locations.map((location) => <option key={location}>{location}</option>)}
                  </select>
                </label>
                <label>
                  Destination
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
                    >
                      {item}
                    </button>
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
                <div>
                  <p className="eyebrow">YOUR OPTIONS</p>
                  <h2>Route comparison</h2>
                </div>
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
                  <RouteCard
                    key={route.name}
                    route={route}
                    recommended={route.name === result.recommended}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <footer>
        Safety scores are estimated using sample data and do not guarantee real-world safety.
      </footer>
    </main>
  );
}