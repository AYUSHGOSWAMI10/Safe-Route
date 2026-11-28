
import { useEffect, useState } from "react";
import MapPanel from "./MapPanel";
import LocationSearch from "./components/LocationSearch";
import AdminDashboard from "./pages/admin/AdminDashboard";
import { signup, login, loginAsDemo, getMe } from "./services/auth.js";
import "./style.css";

const TOKEN_KEY = "saferoute_token";
const ADMIN_SESSION_KEY = "saferoute_admin_session";

const DEMO_ADMIN_EMAIL = "admin@saferoute.demo";
const DEMO_ADMIN_PASSWORD = "Admin@123";

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

const factors = [
  { name: "Street Lighting", value: 35 },
  { name: "Human Activity", value: 70 },
  { name: "Incident History", value: 25 },
  { name: "Pedestrian Infrastructure", value: 80 },
  { name: "Road Condition", value: 60 },
  { name: "Road Isolation", value: 30 },
];

export default function App() {
  // Authentication state
  const [authMode, setAuthMode] = useState("login");

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(
    () => sessionStorage.getItem(ADMIN_SESSION_KEY) === "true"
  );

  const [token, setToken] = useState(
    () => sessionStorage.getItem(TOKEN_KEY) || ""
  );

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  // Route planner state
  const [source, setSource] = useState(null);
  const [destination, setDestination] = useState(null);

  const [sourceName, setSourceName] = useState("");
  const [destinationName, setDestinationName] = useState("");

  const [slider, setSlider] = useState(50);
  const [selectedRoute, setSelectedRoute] = useState("balanced");
  const [showResults, setShowResults] = useState(false);

  // Admin uses a separate frontend route.
  const isAdminDashboard =
    window.location.pathname === "/admin/dashboard";

  // Restore and verify existing user login.
  useEffect(() => {
    let active = true;

    if (isAdminDashboard) {
      setAuthMode("admin");
      setAuthLoading(false);

      return () => {
        active = false;
      };
    }

    if (!token) {
      setAuthLoading(false);

      return () => {
        active = false;
      };
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
  }, [token, isAdminDashboard]);

  // Login, signup, demo login and admin login.
  async function handleAuthSubmit(event) {
    event.preventDefault();

    setAuthError("");
    setAuthLoading(true);

    const form = new FormData(event.currentTarget);

    const email = form.get("email");
    const password = form.get("password");

    try {
      // Temporary frontend-only admin authentication.
      if (authMode === "admin") {
        if (
          email === DEMO_ADMIN_EMAIL &&
          password === DEMO_ADMIN_PASSWORD
        ) {
          sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
          setIsAdminAuthenticated(true);

          window.location.href = "/admin/dashboard";
          return;
        }

        throw new Error("Invalid admin email or password.");
      }

      let data;

      if (authMode === "signup") {
        const name = form.get("name");

        data = await signup({
          name,
          email,
          password,
        });
      } else if (authMode === "demo") {
        data = await loginAsDemo();
      } else {
        data = await login({
          email,
          password,
        });
      }

      if (!data || !data.token || !data.user) {
        throw new Error("Invalid authentication response from server.");
      }

      sessionStorage.setItem(TOKEN_KEY, data.token);

      setUser(data.user);
      setToken(data.token);
    } catch (error) {
      setAuthError(
        error.message || "Authentication failed. Please try again."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  // Admin logout.
  function handleAdminLogout() {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setIsAdminAuthenticated(false);

    window.location.href = "/";
  }

  // Normal user logout.
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
  }

  // Select starting point directly on the map.
  function handleSourceSelect(point) {
    setSource(point);

    setSourceName(
      `Map location (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`
    );

    setShowResults(false);
  }

  // Select destination directly on the map.
  function handleDestinationSelect(point) {
    setDestination(point);

    setDestinationName(
      `Map location (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`
    );

    setShowResults(false);
  }

  // Select starting point from autocomplete.
  function handleSourcePlaceSelect(place) {
    setSource({
      lat: place.lat,
      lng: place.lng,
    });

    setSourceName(place.name);
    setShowResults(false);
  }

  // Select destination from autocomplete.
  function handleDestinationPlaceSelect(place) {
    setDestination({
      lat: place.lat,
      lng: place.lng,
    });

    setDestinationName(place.name);
    setShowResults(false);
  }

  // Clear old coordinates when the user edits a location.
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

  // Route preference slider.
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

  // Demo route search.
  function handleFindRoutes() {
    if (!source || !destination) {
      alert(
        "Please enter and select both locations, or choose them on the map."
      );
      return;
    }

    if (
      source.lat === destination.lat &&
      source.lng === destination.lng
    ) {
      alert("Starting point and destination cannot be the same.");
      return;
    }

    setShowResults(true);
  }

  const activeRoute = routes.find(
    (route) => route.id === selectedRoute
  );

  // Admin dashboard.
  if (isAdminDashboard) {
    if (isAdminAuthenticated) {
      return <AdminDashboard onLogout={handleAdminLogout} />;
    }

    // Prevent the user login page from appearing on the admin URL.
    if (!authLoading && !isAdminAuthenticated) {
      return (
        <div className="auth-loading">
          <h2>SafeRoute</h2>
          <p>Redirecting to administrator login...</p>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
          >
            Go to login
          </button>
        </div>
      );
    }
  }

  // Authentication loading screen.
  if (authLoading) {
    return (
      <div className="auth-loading">
        <h2>SafeRoute</h2>
        <p>Checking your account...</p>
      </div>
    );
  }

  // Login and signup screen.
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
            font-family: Inter, Arial, sans-serif;
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
            padding: 11px 5px;
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
            line-height: 2;
          }

          .auth-footer button {
            border: none;
            background: none;
            color: #2563eb;
            font-weight: 700;
            cursor: pointer;
          }

          .auth-demo-note {
            display: block;
            margin-top: 12px;
            color: #94a3b8;
            line-height: 1.5;
          }

          .auth-loading {
            min-height: 100vh;
            display: grid;
            place-content: center;
            text-align: center;
            color: #172b4d;
          }

          @media (max-width: 480px) {
            .auth-card {
              padding: 25px 20px;
            }
          }
        `}</style>

        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-icon">S</div>
            <h1>SafeRoute</h1>
            <p>Risk-aware route planning</p>
          </div>

          {/* Login / Signup / Admin tabs */}
          <div className="auth-tabs">
            <button
              type="button"
              className={authMode === "login" || authMode === "demo" ? "active" : ""}
              onClick={() => {
                setAuthMode("login");
                setAuthError("");
              }}
            >
              Login
            </button>

            <button
              type="button"
              className={authMode === "signup" ? "active" : ""}
              onClick={() => {
                setAuthMode("signup");
                setAuthError("");
              }}
            >
              Sign up
            </button>

            <button
              type="button"
              className={authMode === "admin" ? "active" : ""}
              onClick={() => {
                setAuthMode("admin");
                setAuthError("");
              }}
            >
              Admin
            </button>
          </div>

          <h2>
            {authMode === "admin"
              ? "Administrator login"
              : authMode === "signup"
              ? "Create your account"
              : authMode === "demo"
              ? "Continue as demo user"
              : "Welcome back!"}
          </h2>

          <p className="auth-subtitle">
            {authMode === "admin"
              ? "Sign in with your administrator credentials."
              : authMode === "signup"
              ? "Join SafeRoute and plan your journeys."
              : "Log in to access your route planner."}
          </p>

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

            {authMode !== "demo" && (
              <>
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
              </>
            )}

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
                : authMode === "admin"
                ? "Admin sign in"
                : authMode === "signup"
                ? "Create account"
                : authMode === "demo"
                ? "Continue as demo user"
                : "Log in"}
            </button>
          </form>

          {authMode === "admin" ? (
            <p className="auth-footer">
              Not an administrator?{" "}
              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setAuthError("");
                }}
              >
                User login
              </button>

              <span className="auth-demo-note">
                Demo credentials:
                <br />
                admin@saferoute.demo / Admin@123
              </span>
            </p>
          ) : (
            <p className="auth-footer">
              {authMode === "login"
                ? "New to SafeRoute? "
                : "Already have an account? "}

              <button
                type="button"
                onClick={() => {
                  setAuthMode(
                    authMode === "signup" ? "login" : "signup"
                  );
                  setAuthError("");
                }}
              >
                {authMode === "signup" ? "Log in" : "Sign up"}
              </button>

              {authMode === "login" && (
                <>
                  <br />
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("demo");
                      setAuthError("");
                    }}
                  >
                    Continue as Demo User
                  </button>
                </>
              )}

              {authMode === "demo" && (
                <>
                  <br />
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setAuthError("");
                    }}
                  >
                    Back to login
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Main SafeRoute user dashboard.
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">S</div>

          <div>
            <h2>SafeRoute</h2>
            <span>Risk-aware route planning</span>
          </div>
        </div>

        <nav className="top-nav">
          <a href="#planner">Route Planner</a>
          <a href="#insights">Safety Insights</a>
        </nav>

        <div className="profile">
          <div className="profile-avatar">
            {(user?.name || "U").charAt(0).toUpperCase()}
          </div>

          <span>{user?.name || "User"}</span>

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
        <section className="welcome-section">
          <div>
            <p className="eyebrow">
              SMARTER ROUTES. BETTER AWARENESS.
            </p>

            <h1>Plan your journey with confidence.</h1>

            <p className="welcome-text">
              Compare routes based on travel time and estimated road
              risk. Choose the balance that works for you.
            </p>
          </div>
        </section>

        <div className="status-pill">
          <span></span> Demo mode
        </div>

        <section className="planner-layout" id="planner">
          <div className="planner-left">
            {/* Location selection */}
            <div className="panel location-panel">
              <div className="section-heading">
                <div>
                  <h3>Plan your journey</h3>
                  <p>Choose where your journey begins and ends.</p>
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

              <button
                type="button"
                className="primary-button"
                onClick={handleFindRoutes}
              >
                Find Routes <span>→</span>
              </button>
            </div>

            {/* Route preference */}
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
                <strong>{slider}% risk preference</strong>
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

            {/* Map */}
            <MapPanel
              source={source}
              destination={destination}
              onSourceSelect={handleSourceSelect}
              onDestinationSelect={handleDestinationSelect}
            />
          </div>

          {/* Route recommendations and safety insights */}
          <aside className="planner-right">
            <div className="panel results-panel">
              <div className="section-heading">
                <div>
                  <h3>Route recommendations</h3>
                  <p>Compare your available options.</p>
                </div>

                <span className="step-number">03</span>
              </div>

              {!showResults ? (
                <div className="empty-state">
                  <div className="empty-icon">⌖</div>

                  <h4>Select your locations</h4>

                  <p>
                    Search for both places above and choose a
                    suggestion, or click the map to select either
                    location.
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
                          selectedRoute === route.id ? "selected" : ""
                        }`}
                        onClick={() => setSelectedRoute(route.id)}
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

                          <strong style={{ color: route.color }}>
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
                      <h4>Selected: {activeRoute.name}</h4>

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

            {/* Safety breakdown */}
            <div className="panel insight-panel" id="insights">
              <div className="section-heading">
                <div>
                  <h3>Safety breakdown</h3>
                  <p>
                    Illustrative factor scores for the selected route.
                  </p>
                </div>
              </div>

              {factors.map((factor) => (
                <div className="factor" key={factor.name}>
                  <div className="factor-heading">
                    <span>{factor.name}</span>
                    <strong>{factor.value}/100</strong>
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
                  Each factor contributes to the estimated road-risk
                  score. Higher factor values indicate a greater
                  concern in this illustrative demo.
                </p>
              </div>
            </div>
          </aside>
        </section>

        {/* Safety disclaimer */}
        <section className="disclaimer">
          <span>ⓘ</span>

          <div>
            <strong>Important safety information</strong>

            <p>
              SafeRoute provides estimated risk information based on
              available data. Scores shown here are illustrative demo
              values and do not guarantee personal safety.
            </p>
          </div>
        </section>

        <footer className="footer">
          <span>© 2026 SafeRoute</span>
          <span>Powered by OpenStreetMap</span>
          <span>Estimated risk · Demo data</span>
        </footer>
      </main>
    </div>
  );
}
