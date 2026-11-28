
import { useState } from "react";
import ReportsManagement from "./ReportsManagement";
import RiskMap from "./RiskMap";

const styles = `
.admin-shell {
  min-height: 100vh;
  display: flex;
  background: #f4f7fb;
  color: #172033;
  font-family: Inter, Arial, sans-serif;
}

.admin-sidebar {
  width: 250px;
  flex-shrink: 0;
  background: #10233f;
  color: #fff;
  padding: 26px 18px;
  display: flex;
  flex-direction: column;
}

.admin-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 10px 30px;
  border-bottom: 1px solid #ffffff20;
}

.admin-brand-mark {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #2563eb;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 20px;
}

.admin-brand strong {
  display: block;
  font-size: 18px;
}

.admin-brand small {
  color: #aabbd3;
  font-size: 11px;
}

.admin-nav {
  display: grid;
  gap: 8px;
  margin-top: 28px;
}

.admin-nav button {
  border: 0;
  text-align: left;
  padding: 13px 14px;
  border-radius: 9px;
  background: transparent;
  color: #cbd5e1;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.admin-nav button:hover,
.admin-nav button.active {
  background: #ffffff18;
  color: #fff;
}

.admin-sidebar-footer {
  margin-top: auto;
  border-top: 1px solid #ffffff20;
  padding: 18px 8px 0;
  color: #aabbd3;
  font-size: 12px;
  line-height: 1.6;
}

.admin-main {
  flex: 1;
  min-width: 0;
  padding: 30px 34px;
}

.admin-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 30px;
}

.admin-topbar p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.admin-topbar h1 {
  margin: 5px 0 0;
  font-size: 27px;
  color: #172033;
}

.admin-logout {
  border: 1px solid #dbe2ea;
  background: white;
  color: #334155;
  padding: 10px 15px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.admin-welcome {
  background: linear-gradient(120deg, #1d4ed8, #2563eb);
  color: white;
  border-radius: 16px;
  padding: 26px;
  margin-bottom: 24px;
}

.admin-welcome h2 {
  margin: 0 0 8px;
  font-size: 21px;
}

.admin-welcome p {
  margin: 0;
  color: #dbeafe;
  font-size: 14px;
  line-height: 1.6;
}

.admin-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.admin-stat {
  background: white;
  border: 1px solid #e7ebf0;
  border-radius: 13px;
  padding: 20px;
}

.admin-stat span {
  display: block;
  color: #64748b;
  font-size: 13px;
}

.admin-stat strong {
  display: block;
  font-size: 28px;
  margin-top: 10px;
}

.admin-stat small {
  display: block;
  color: #94a3b8;
  margin-top: 5px;
}

.admin-content-card {
  background: white;
  border: 1px solid #e7ebf0;
  border-radius: 13px;
  padding: 22px;
}

.admin-content-card h2 {
  font-size: 18px;
  margin: 0 0 6px;
}

.admin-content-card > p {
  font-size: 13px;
  color: #64748b;
  margin: 0 0 18px;
}

.admin-quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.admin-quick-actions button {
  border: 0;
  border-radius: 8px;
  background: #eff6ff;
  color: #1d4ed8;
  padding: 12px 15px;
  font-weight: 700;
  cursor: pointer;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.admin-table th,
.admin-table td {
  padding: 14px 12px;
  border-bottom: 1px solid #edf0f4;
  font-size: 13px;
}

.admin-table th {
  color: #64748b;
  background: #f8fafc;
  font-size: 12px;
}

.admin-tag {
  display: inline-block;
  padding: 5px 9px;
  border-radius: 20px;
  background: #fef3c7;
  color: #a16207;
  font-size: 11px;
  font-weight: 700;
}

@media (max-width: 900px) {
  .admin-sidebar {
    width: 210px;
  }

  .admin-main {
    padding: 24px 20px;
  }

  .admin-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 650px) {
  .admin-shell {
    display: block;
  }

  .admin-sidebar {
    width: auto;
    padding: 16px;
  }

  .admin-brand {
    padding-bottom: 15px;
  }

  .admin-nav {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 15px;
  }

  .admin-nav button {
    text-align: center;
    padding: 10px 5px;
    font-size: 12px;
  }

  .admin-sidebar-footer {
    display: none;
  }

  .admin-main {
    padding: 20px 14px;
  }

  .admin-topbar {
    align-items: flex-start;
  }

  .admin-stat-grid {
    gap: 10px;
  }

  .admin-stat {
    padding: 14px;
  }

  .admin-stat strong {
    font-size: 23px;
  }
}
`;

const sampleRecentReports = [
  {
    id: "SR-104",
    type: "Broken Streetlight",
    location: "Krishna Nagar",
    status: "Pending",
  },
  {
    id: "SR-103",
    type: "Damaged Road",
    location: "Janakpuri",
    status: "Approved",
  },
  {
    id: "SR-102",
    type: "Isolated Area",
    location: "Railway Colony",
    status: "Pending",
  },
];

export default function AdminDashboard({
  onLogout = () => {
    window.location.href = "/";
  },
}) {
  const [activeSection, setActiveSection] = useState("dashboard");

  const pageTitle =
    activeSection === "reports"
      ? "Reports Management"
      : activeSection === "risk-map"
      ? "Risk Map"
      : "Dashboard Overview";

  return (
    <div className="admin-shell">
      <style>{styles}</style>

      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-mark">S</div>

          <div>
            <strong>SafeRoute</strong>
            <small>ADMIN CONSOLE</small>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Admin navigation">
          <button
            className={
              activeSection === "dashboard" ? "active" : ""
            }
            onClick={() => setActiveSection("dashboard")}
          >
            ▦ &nbsp; Overview
          </button>

          <button
            className={
              activeSection === "reports" ? "active" : ""
            }
            onClick={() => setActiveSection("reports")}
          >
            ▤ &nbsp; Reports
          </button>

          <button
            className={
              activeSection === "risk-map" ? "active" : ""
            }
            onClick={() => setActiveSection("risk-map")}
          >
            ⌖ &nbsp; Risk Map
          </button>
        </nav>

        <div className="admin-sidebar-footer">
          SafeRoute Admin
          <br />
          Frontend prototype · Demo data
        </div>
      </aside>

      {/* Main content */}
      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <p>ADMINISTRATION / SAFEROUTE</p>
            <h1>{pageTitle}</h1>
          </div>

          <button
            className="admin-logout"
            onClick={onLogout}
          >
            Log out
          </button>
        </header>

        {/* Reports Management */}
        {activeSection === "reports" ? (
          <ReportsManagement
            onBack={() => setActiveSection("dashboard")}
          />
        ) : /* Risk Map */
        activeSection === "risk-map" ? (
          <RiskMap />
        ) : (
          /* Dashboard Overview */
          <>
            <section className="admin-welcome">
              <h2>
                Welcome to the SafeRoute Admin Dashboard
              </h2>

              <p>
                Review community hazard reports, monitor their
                status, and keep the safety information organized.
                The figures below are sample prototype data.
              </p>
            </section>

            {/* Statistics */}
            <section className="admin-stat-grid">
              <div className="admin-stat">
                <span>Total Reports</span>
                <strong>128</strong>
                <small>Sample report count</small>
              </div>

              <div className="admin-stat">
                <span>Pending Review</span>
                <strong>24</strong>
                <small>Awaiting admin action</small>
              </div>

              <div className="admin-stat">
                <span>Approved</span>
                <strong>89</strong>
                <small>Marked as verified in demo</small>
              </div>

              <div className="admin-stat">
                <span>Rejected</span>
                <strong>15</strong>
                <small>Not approved in demo</small>
              </div>
            </section>

            {/* Quick Actions */}
            <section
              className="admin-content-card"
              style={{ marginBottom: 20 }}
            >
              <h2>Quick actions</h2>

              <p>
                Go directly to the main admin tasks.
              </p>

              <div className="admin-quick-actions">
                <button
                  onClick={() => setActiveSection("reports")}
                >
                  Review submitted reports →
                </button>

                <button
                  onClick={() => setActiveSection("risk-map")}
                >
                  Open risk map →
                </button>
              </div>
            </section>

            {/* Recent Reports */}
            <section className="admin-content-card">
              <h2>Recent reports</h2>

              <p>
                Example reports for the dashboard preview.
              </p>

              <div style={{ overflowX: "auto" }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Report ID</th>
                      <th>Hazard type</th>
                      <th>Location</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {sampleRecentReports.map((report) => (
                      <tr key={report.id}>
                        <td>
                          <strong>{report.id}</strong>
                        </td>

                        <td>{report.type}</td>
                        <td>{report.location}</td>

                        <td>
                          <span
                            className="admin-tag"
                            style={
                              report.status === "Approved"
                                ? {
                                    background: "#dcfce7",
                                    color: "#15803d",
                                  }
                                : {}
                            }
                          >
                            {report.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
