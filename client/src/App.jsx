import { useEffect, useState } from "react";

import MapPanel from "./MapPanel";
import LocationSearch from "./components/LocationSearch";
import RouteHistory from "./components/RouteHistory";
import SafetyReports from "./components/SafetyReports";

import {
  signup,
  login,
  loginAsDemo,
  getMe,
} from "./services/auth.js";

import "./style.css";

const TOKEN_KEY = "saferoute_token";

// Demo route data
const routes = [
  {
    id: "fast",
    name: "Fastest",
    time: "12 min",
    distance: "1.8 km",
    risk: 72,
    color: "#dc5555",
    highRisk: "35%",
    description: "Shortest travel time, but higher estimated risk.",
  },
  {
    id: "balanced",
    name: "Balanced",
    time: "15 min",
    distance: "2.1 km",
    risk: 48,
    color: "#d99b35",
    highRisk: "18%",
    description: "Balances travel time and estimated risk.",
  },
  {
    id: "safe",
    name: "Safer",
    time: "19 min",
    distance: "2.5 km",
    risk: 25,
    color: "#269b69",
    highRisk: "5%",
    description: "Lower estimated risk, with additional travel time.",
  },
];

// Illustrative safety factors
const factors = [
  { name: "Street Lighting", value: 35 },
  { name: "Human Activity", value: 70 },
  { name: "Incident History", value: 25 },
  { name: "Pedestrian Infrastructure", value: 80 },
  { name: "Road Condition", value: 60 },
  { name: "Road Isolation", value: 30 },
];

export default function App() {
  // =================================
  // AUTHENTICATION STATE
  // =================================

  const [authMode, setAuthMode] = useState("login");
  const [activeView, setActiveView] = useState("planner");

  const [token, setToken] = useState(
    () => sessionStorage.getItem(TOKEN_KEY) || ""
  );

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  // =================================
  // DASHBOARD STATE
  // =================================

  const [source, setSource] = useState(null);
  const [destination, setDestination] = useState(null);

  const [sourceName, setSourceName] = useState("");
  const [destinationName, setDestinationName] = useState("");

  const [slider, setSlider] = useState(50);
  const [selectedRoute, setSelectedRoute] = useState("balanced");

  const [showResults, setShowResults] = useState(false);

  // =================================
  // VERIFY EXISTING LOGIN SESSION
  // =================================

  useEffect(() => {
    let active = true;

    if (!token) {
      setAuthLoading(false);
      return;
    }

    getMe(token)
      .then((profile) => {
        if (active) {
          setUser(profile);
        }
      })
      .catch(() => {
        sessionStorage.removeItem(TOKEN_KEY);

        if (active) {
          setToken("");
          setUser(null);
        }
      })
      .finally(() => {
        if (active) {
          setAuthLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  // =================================
  // LOGIN / SIGNUP
  // =================================

  async function handleAuthSubmit(event) {
    event.preventDefault();

    setAuthError("");
    setAuthLoading(true);

    const form = new FormData(event.currentTarget);

    const email = form.get("email");
    const password = form.get("password");

    try {
      let data;

      if (authMode === "signup") {
        const name = form.get("name");

        data = await signup({
          name,
          email,
          password,
        });
      } else {
        data = await login({
          email,
          password,
        });
      }

      sessionStorage.setItem(TOKEN_KEY, data.token);

      setUser(data.user);
      setToken(data.token);

    } catch (error) {
      setAuthError(
        error.message || "Authentication failed."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  // =================================
  // DEMO LOGIN
  // =================================

  async function handleDemoLogin() {
    setAuthError("");
    setAuthLoading(true);

    try {
      const data = await loginAsDemo();

      sessionStorage.setItem(TOKEN_KEY, data.token);

      setUser(data.user);
      setToken(data.token);

    } catch (error) {
      setAuthError(
        error.message || "Demo login failed."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  // =================================
  // LOGOUT
  // =================================

  function handleLogout() {
    sessionStorage.removeItem(TOKEN_KEY);

    setToken("");
    setUser(null);

    setAuthError("");

    setShowResults(false);

    setSource(null);
    setDestination(null);

    setSourceName("");
    setDestinationName("");

    setSlider(50);
    setSelectedRoute("balanced");
    setAuthMode("login");
    setActiveView("planner");
  }

  // =================================
  // MAP LOCATION SELECTION
  // =================================

  function handleSourceSelect(point) {
    setSource(point);

    setSourceName(
      `Map location (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`
    );

    setShowResults(false);
  }

  function handleDestinationSelect(point) {
    setDestination(point);

    setDestinationName(
      `Map location (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`
    );

    setShowResults(false);
  }

  // =================================
  // SEARCH LOCATION SELECTION
  // =================================

  function handleSourcePlaceSelect(place) {
    setSource({
      lat: place.lat,
      lng: place.lng,
    });

    setSourceName(place.name);
    setShowResults(false);
  }

  function handleDestinationPlaceSelect(place) {
    setDestination({
      lat: place.lat,
      lng: place.lng,
    });

    setDestinationName(place.name);
    setShowResults(false);
  }

  // =================================
  // LOCATION INPUT CHANGES
  // =================================

  function handleSourceInput(value) {
    setSourceName(value);
    setSource(null);
    setShowResults(false);
  }

  function handleDestinationInput(value) {
    setDestinationName(value);
    setDestination(null);
    setShowResults(false);
  }

  // Swap both selected locations and their coordinates.
  function handleSwapLocations() {
    setSource(destination);
    setDestination(source);
    setSourceName(destinationName);
    setDestinationName(sourceName);
    setShowResults(false);
  }

  // =================================
  // ROUTE PREFERENCE SLIDER
  // =================================

  function handleSliderChange(event) {
    const value = Number(event.target.value);

    setSlider(value);

    if (value < 33) {
      setSelectedRoute("fast");
    } else if (value < 67) {
      setSelectedRoute("balanced");
    } else {
      setSelectedRoute("safe");
    }
  }

  // =================================
  // FIND ROUTES
  // =================================

  function handleFindRoutes() {
    if (!source || !destination) {
      alert(
        "Please select both locations using search suggestions or the map."
      );

      return;
    }

    if (
      source.lat === destination.lat &&
      source.lng === destination.lng
    ) {
      alert(
        "Starting point and destination cannot be the same."
      );

      return;
    }

    setShowResults(true);
  }

  // Currently selected route
  const activeRoute = routes.find(
    (route) => route.id === selectedRoute
  );

  // =================================
  // AUTHENTICATION LOADING
  // =================================

  if (authLoading) {
    return (
      <div className="auth-loading">
        <h2>SafeRoute</h2>
        <p>Checking your account...</p>
      </div>
    );
  }

  // =================================
  // LOGIN / SIGNUP PAGE
  // =================================

  if (!user) {
    return (
      <div className="auth-page">

        <style>{`
          .auth-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 25px;
            background: linear-gradient(135deg, #10233f, #1e40af);
            font-family: Inter, sans-serif;
          }

          .auth-card {
            background: white;
            width: 100%;
            max-width: 430px;
            padding: 38px;
            border-radius: 18px;
            box-shadow: 0 20px 60px #0003;
          }

          .auth-logo {
            text-align: center;
            margin-bottom: 25px;
          }

          .auth-logo-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 48px;
            height: 48px;
            background: #2563eb;
            color: white;
            border-radius: 13px;
            font-size: 25px;
            font-weight: 800;
          }

          .auth-logo h1 {
            margin-top: 12px;
            color: #172b4d;
            font-size: 26px;
          }

          .auth-logo p {
            color: #64748b;
            font-size: 13px;
            margin-top: 7px;
          }

          .auth-tabs {
            display: flex;
            background: #f1f5f9;
            padding: 5px;
            border-radius: 9px;
            margin-bottom: 25px;
          }

          .auth-tabs button {
            flex: 1;
            border: none;
            padding: 11px;
            border-radius: 7px;
            background: transparent;
            color: #64748b;
            font-weight: 600;
            cursor: pointer;
          }

          .auth-tabs button.active {
            background: white;
            color: #2563eb;
            box-shadow: 0 1px 5px #0001;
          }

          .auth-card h2 {
            color: #172b4d;
            font-size: 21px;
            margin-bottom: 7px;
          }

          .auth-subtitle {
            color: #64748b;
            font-size: 13px;
            margin-bottom: 22px;
          }

          .auth-field {
            display: block;
            color: #334155;
            font-size: 12px;
            font-weight: 700;
            margin-bottom: 17px;
          }

          .auth-field input {
            display: block;
            width: 100%;
            height: 45px;
            margin-top: 8px;
            padding: 0 12px;
            border: 1px solid #dce3ed;
            border-radius: 8px;
            outline: none;
            font-size: 13px;
          }

          .auth-field input:focus {
            border-color: #2563eb;
            box-shadow: 0 0 0 3px #2563eb18;
          }

          .auth-submit {
            width: 100%;
            padding: 13px;
            border: none;
            border-radius: 8px;
            color: white;
            background: #2563eb;
            font-weight: 700;
            margin-top: 5px;
            cursor: pointer;
          }

          .auth-submit:disabled {
            opacity: .6;
            cursor: not-allowed;
          }

          .auth-error {
            background: #fef2f2;
            color: #b91c1c;
            padding: 11px;
            border-radius: 7px;
            font-size: 12px;
            margin-bottom: 15px;
          }

          .auth-footer {
            text-align: center;
            margin-top: 22px;
            font-size: 12px;
            color: #64748b;
          }

          .auth-footer button {
            border: none;
            background: none;
            color: #2563eb;
            font-weight: 700;
            cursor: pointer;
          }

          .demo-button {
            width: 100%;
            padding: 12px;
            margin-top: 12px;
            border: 1px solid #2563eb;
            border-radius: 8px;
            color: #2563eb;
            background: white;
            font-weight: 700;
            cursor: pointer;
          }

          .demo-button:disabled {
            opacity: .6;
            cursor: not-allowed;
          }

          .auth-loading {
            min-height: 100vh;
            display: grid;
            place-content: center;
            text-align: center;
            color: #172b4d;
          }
        `}</style>

        <div className="auth-card">

          <div className="auth-logo">
            <div className="auth-logo-icon">S</div>

            <h1>SafeRoute</h1>

            <p>Risk-aware route planning</p>
          </div>

          {/* AUTH TABS */}

          <div className="auth-tabs">

            <button
              type="button"
              className={
                authMode === "login" ? "active" : ""
              }
              onClick={() => {
                setAuthMode("login");
                setAuthError("");
              }}
            >
              Login
            </button>

            <button
              type="button"
              className={
                authMode === "signup" ? "active" : ""
              }
              onClick={() => {
                setAuthMode("signup");
                setAuthError("");
              }}
            >
              Sign up
            </button>

          </div>

          <h2>
            {authMode === "login"
              ? "Welcome back!"
              : "Create your account"}
          </h2>

          <p className="auth-subtitle">
            {authMode === "login"
              ? "Log in to access your route planner."
              : "Join SafeRoute and plan your journeys."}
          </p>

          {/* AUTH FORM */}

          <form onSubmit={handleAuthSubmit}>

            {authMode === "signup" && (
              <label className="auth-field">
                Full name

                <input
                  type="text"
                  name="name"
                  placeholder="Enter your full name"
                  minLength={2}
                  maxLength={80}
                  required
                />
              </label>
            )}

            <label className="auth-field">
              Email address

              <input
                type="email"
                name="email"
                placeholder="Enter your email"
                required
              />
            </label>

            <label className="auth-field">
              Password

              <input
                type="password"
                name="password"
                placeholder="Enter your password"
                minLength={8}
                maxLength={72}
                required
              />
            </label>

            {authError && (
              <p className="auth-error" role="alert">
                {authError}
              </p>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={authLoading}
            >
              {authLoading
                ? "Please wait..."
                : authMode === "login"
                ? "Log in"
                : "Create account"}
            </button>

          </form>

          {/* DEMO LOGIN */}

          <button
            type="button"
            className="demo-button"
            onClick={handleDemoLogin}
            disabled={authLoading}
          >
            Continue as Demo User
          </button>

          {/* AUTH FOOTER */}

          <p className="auth-footer">

            {authMode === "login"
              ? "New to SafeRoute? "
              : "Already have an account? "}

            <button
              type="button"
              onClick={() => {
                setAuthMode(
                  authMode === "login"
                    ? "signup"
                    : "login"
                );

                setAuthError("");
              }}
            >
              {authMode === "login"
                ? "Sign up"
                : "Log in"}
            </button>

          </p>

        </div>

      </div>
    );
  }

  // =================================
  // SAFEROUTE DASHBOARD
  // =================================

  return (
    <div className="app">

      {/* HEADER */}

      <header className="topbar">

        <div className="brand">

          <div className="brand-icon">S</div>

          <div>
            <h2>SafeRoute</h2>
            <span>Risk-aware route planning</span>
          </div>

        </div>

        <nav className="top-nav" aria-label="Main navigation">
          <a
            href="#planner"
            className={activeView === "planner" ? "active" : ""}
            onClick={() => setActiveView("planner")}
          >
            Route Planner
          </a>
          <a
            href="#insights"
            onClick={() => setActiveView("planner")}
          >
            Safety Insights
          </a>
          <button
            type="button"
            className={`history-nav-button ${activeView === "history" ? "active" : ""}`}
            onClick={() => setActiveView("history")}
            aria-current={activeView === "history" ? "page" : undefined}
          >
            History
          </button>
                  <button
            type="button"
            className={`history-nav-button ${activeView === "reports" ? "active" : ""}`}
            onClick={() => setActiveView("reports")}
            aria-current={activeView === "reports" ? "page" : undefined}
          >
            Safety Reports
          </button>
        </nav>

        <div className="profile">

          <div className="profile-avatar">
            {(user.name || "U")
              .charAt(0)
              .toUpperCase()}
          </div>

          <span>{user.name}</span>

          <button
            type="button"
            onClick={handleLogout}
            className="logout-button"
          >
            Log out
          </button>

        </div>

      </header>

      <main className="dashboard">
        {activeView === "history" ? (
          <RouteHistory
            token={token}
            isDemo={user?.id === "demo-user"}
            onBack={() => setActiveView("planner")}
          />
        ) : (
          <>
        {/* INTRO SECTION */}

        <section className="welcome-section">

          <div>

            <p className="eyebrow">
              SMARTER ROUTES. BETTER AWARENESS.
            </p>

            <h1>
              Plan your journey with confidence.
            </h1>

            <p className="welcome-text">
              Compare routes based on travel time and
              estimated road risk. Choose the balance
              that works for you.
            </p>

          </div>

          <div className="status-pill">
            <span></span>
            Demo mode
          </div>

        </section>

        {/* PLANNER LAYOUT */}

        <section
          className="planner-layout"
          id="planner"
        >

          {/* LEFT SIDE */}

          <div className="planner-left">

            {/* LOCATION PANEL */}

            <div className="panel location-panel">

              <div className="section-heading">

                <div>
                  <h3>Plan your journey</h3>

                  <p>
                    Choose where your journey begins and ends.
                  </p>
                </div>

                <span className="step-number">01</span>

              </div>

              <div className="location-inputs">

                <LocationSearch
                  label="Starting point"
                  value={sourceName}
                  onChange={handleSourceInput}
                  onSelect={handleSourcePlaceSelect}
                  placeholder="Search starting location..."
                />

                <LocationSearch
                  label="Destination"
                  value={destinationName}
                  onChange={handleDestinationInput}
                  onSelect={handleDestinationPlaceSelect}
                  placeholder="Search destination..."
                />

              </div>

              <div className="location-swap-row">
                <button
                  type="button"
                  className="location-swap-button"
                  onClick={handleSwapLocations}
                  disabled={!source && !destination && !sourceName && !destinationName}
                  aria-label="Swap starting point and destination"
                >
                  <span aria-hidden="true">⇅</span>
                  Swap locations
                </button>
              </div>

              <button
                type="button"
                className="primary-button"
                onClick={handleFindRoutes}
              >
                Find Routes <span>→</span>
              </button>

            </div>

            {/* PREFERENCE PANEL */}

            <div className="panel preference-panel">

              <div className="section-heading">

                <div>
                  <h3>Route preference</h3>

                  <p>
                    How much do you value lower estimated risk?
                  </p>
                </div>

                <span className="step-number">02</span>

              </div>

              <div className="preference-labels">

                <span>Fastest</span>

                <strong>
                  {slider}% risk preference
                </strong>

                <span>Safer</span>

              </div>

              <input
                className="risk-slider"
                type="range"
                min="0"
                max="100"
                value={slider}
                onChange={handleSliderChange}
              />

              <div className="slider-caption">

                <span>Prioritize time</span>

                <span>Prioritize lower risk</span>

              </div>

            </div>

            {/* MAP PANEL */}

            <MapPanel
              source={source}
              destination={destination}
              onSourceSelect={handleSourceSelect}
              onDestinationSelect={handleDestinationSelect}
            />

          </div>

          {/* RIGHT SIDE */}

          <aside className="planner-right">

            {/* ROUTE RESULTS */}

            <div className="panel results-panel">

              <div className="section-heading">

                <div>
                  <h3>Route recommendations</h3>

                  <p>
                    Compare your available options.
                  </p>
                </div>

                <span className="step-number">03</span>

              </div>

              {!showResults ? (

                <div className="empty-state">

                  <div className="empty-icon">⌖</div>

                  <h4>Select your locations</h4>

                  <p>
                    Search for both places above and choose
                    a suggestion, or click the map to select
                    either location.
                  </p>

                </div>

              ) : (

                <>

                  <div className="route-list">

                    {routes.map((route) => (

                      <button
                        type="button"
                        key={route.id}
                        className={`route-option ${
                          selectedRoute === route.id
                            ? "selected"
                            : ""
                        }`}
                        onClick={() =>
                          setSelectedRoute(route.id)
                        }
                      >

                        <div className="route-option-top">

                          <strong>{route.name}</strong>

                          {route.id === "safe" && (
                            <span className="recommended-tag">
                              Lower risk
                            </span>
                          )}

                        </div>

                        <div className="route-metrics">

                          <span>{route.time}</span>

                          <span>{route.distance}</span>

                        </div>

                        <div className="risk-line">

                          <span>Estimated risk</span>

                          <strong
                            style={{ color: route.color }}
                          >
                            {route.risk}/100
                          </strong>

                        </div>

                        <div className="risk-track">

                          <div
                            style={{
                              width: `${route.risk}%`,
                              background: route.color,
                            }}
                          />

                        </div>

                        <small>{route.description}</small>

                      </button>

                    ))}

                  </div>

                  {activeRoute && (

                    <div className="selected-summary">

                      <h4>
                        Selected: {activeRoute.name}
                      </h4>

                      <p>
                        {activeRoute.time} · {activeRoute.distance}
                      </p>

                      <p>
                        High-risk road segments: {activeRoute.highRisk}
                      </p>

                    </div>

                  )}

                </>

              )}

            </div>

            {/* SAFETY INSIGHTS */}

            <div
              className="panel insight-panel"
              id="insights"
            >

              <div className="section-heading">

                <div>
                  <h3>Safety breakdown</h3>

                  <p>
                    Illustrative factor scores for the selected route.
                  </p>
                </div>

              </div>

              {factors.map((factor) => (

                <div
                  className="factor"
                  key={factor.name}
                >

                  <div className="factor-heading">

                    <span>{factor.name}</span>

                    <strong>
                      {factor.value}/100
                    </strong>

                  </div>

                  <div className="factor-track">

                    <div
                      style={{
                        width: `${factor.value}%`,
                        background:
                          factor.value >= 70
                            ? "#d99b35"
                            : factor.value >= 40
                            ? "#5289c7"
                            : "#269b69",
                      }}
                    />

                  </div>

                </div>

              ))}

              <div className="explanation">

                <strong>Understanding the scores</strong>

                <p>
                  Each factor contributes to the estimated
                  road-risk score. Higher factor values
                  indicate a greater concern in this
                  illustrative demo.
                </p>

              </div>

            </div>

          </aside>

        </section>

        {/* DISCLAIMER */}

        <section className="disclaimer">

          <span>ⓘ</span>

          <div>

            <strong>
              Important safety information
            </strong>

            <p>
              SafeRoute provides estimated risk information
              based on available data. Scores shown here
              are illustrative demo values and do not
              guarantee personal safety.
            </p>

          </div>

        </section>

        {/* FOOTER */}

        <footer className="footer">

          <span>© 2026 SafeRoute</span>

          <span>Powered by OpenStreetMap</span>

          <span>Estimated risk · Demo data</span>

        </footer>
          </>
        )}
      </main>

    </div>
  );
}