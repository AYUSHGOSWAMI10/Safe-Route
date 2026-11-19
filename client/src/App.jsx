
import { useState } from "react";
import MapPanel from "./MapPanel";
import "./style.css";

const initialRoutes = [
  {
    id: "fast",
    name: "Fastest",
    time: "12 min",
    distance: "1.8 km",
    risk: 72,
    color: "#dc5555",
    description: "Shortest travel time, but higher estimated risk.",
    highRisk: "35%",
  },
  {
    id: "balanced",
    name: "Balanced",
    time: "15 min",
    distance: "2.1 km",
    risk: 48,
    color: "#d99b35",
    description: "A balance between travel time and estimated risk.",
    highRisk: "18%",
  },
  {
    id: "safe",
    name: "Safer",
    time: "19 min",
    distance: "2.5 km",
    risk: 25,
    color: "#269b69",
    description: "Lower estimated risk, with some additional travel time.",
    highRisk: "5%",
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

function App() {
  const [source, setSource] = useState(null);
  const [destination, setDestination] = useState(null);

  const [sourceName, setSourceName] = useState("");
  const [destinationName, setDestinationName] = useState("");

  const [slider, setSlider] = useState(50);
  const [selectedRoute, setSelectedRoute] = useState("balanced");
  const [showResults, setShowResults] = useState(true);

  const handleSourceSelect = (point) => {
    setSource(point);
    setSourceName(
      `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`
    );
    setShowResults(false);
  };

  const handleDestinationSelect = (point) => {
    setDestination(point);
    setDestinationName(
      `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`
    );
    setShowResults(false);
  };

  const findRoutes = () => {
    if (!source || !destination) {
      alert("Please select both source and destination on the map.");
      return;
    }

    setShowResults(true);
  };

  const activeRoute = initialRoutes.find(
    (route) => route.id === selectedRoute
  );

  const handleSliderChange = (event) => {
    const value = Number(event.target.value);
    setSlider(value);

    if (value < 33) {
      setSelectedRoute("fast");
    } else if (value < 67) {
      setSelectedRoute("balanced");
    } else {
      setSelectedRoute("safe");
    }
  };

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
          <div className="profile-avatar">U</div>
          <span>User</span>
        </div>
      </header>

      <main className="dashboard">
        <section className="welcome-section">
          <div>
            <p className="eyebrow">SMARTER ROUTES. BETTER AWARENESS.</p>
            <h1>Plan your journey with confidence.</h1>
            <p className="welcome-text">
              Compare routes based on travel time and estimated road risk.
              Choose the balance that works for you.
            </p>
          </div>
          <div className="status-pill">
            <span></span> Demo mode
          </div>
        </section>

        <section className="planner-layout" id="planner">
          <div className="planner-left">
            <div className="panel location-panel">
              <div className="section-heading">
                <div>
                  <h3>Plan your journey</h3>
                  <p>Choose where your journey begins and ends.</p>
                </div>
                <span className="step-number">01</span>
              </div>

              <div className="location-inputs">
                <label>
                  <span className="input-marker source-marker"></span>
                  Starting point
                  <input
                    type="text"
                    placeholder="Select on the map"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                  />
                </label>

                <label>
                  <span className="input-marker destination-marker"></span>
                  Destination
                  <input
                    type="text"
                    placeholder="Select on the map"
                    value={destinationName}
                    onChange={(e) => setDestinationName(e.target.value)}
                  />
                </label>
              </div>

              <button className="primary-button" onClick={findRoutes}>
                Find Routes <span>→</span>
              </button>
            </div>

            <div className="panel preference-panel">
              <div className="section-heading">
                <div>
                  <h3>Route preference</h3>
                  <p>How much do you value lower estimated risk?</p>
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

            <MapPanel
              source={source}
              destination={destination}
              onSourceSelect={handleSourceSelect}
              onDestinationSelect={handleDestinationSelect}
            />
          </div>

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
                    Click the map once for your starting point and again for
                    your destination.
                  </p>
                </div>
              ) : (
                <>
                  <div className="route-list">
                    {initialRoutes.map((route) => (
                      <button
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
                          ></div>
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

            <div className="panel insight-panel" id="insights">
              <div className="section-heading">
                <div>
                  <h3>Safety breakdown</h3>
                  <p>Illustrative factor scores for the selected route.</p>
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
                    ></div>
                  </div>
                </div>
              ))}

              <div className="explanation">
                <strong>Understanding the scores</strong>
                <p>
                  Each factor contributes to the estimated road-risk score.
                  Higher factor values indicate a greater concern in this
                  illustrative demo.
                </p>
              </div>
            </div>
          </aside>
        </section>

        <section className="disclaimer">
          <span>ⓘ</span>
          <div>
            <strong>Important safety information</strong>
            <p>
              SafeRoute provides estimated risk information based on available
              data. Scores shown here are illustrative demo values and do not
              guarantee personal safety. Always use your own judgment.
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

export default App;
