
import { useMemo, useState } from "react";
import "./RiskMap.css";

const hazardReports = [
  {
    id: "SR-001",
    type: "Broken Streetlight",
    location: "Krishna Nagar, Mathura",
    risk: "High",
    status: "Pending",
    description:
      "Streetlight near the main crossing has not been working for several days.",
    x: 27,
    y: 30,
  },
  {
    id: "SR-002",
    type: "Damaged Road",
    location: "Janakpuri, Mathura",
    risk: "High",
    status: "Approved",
    description:
      "A large pothole is making it difficult for vehicles to pass safely.",
    x: 67,
    y: 24,
  },
  {
    id: "SR-003",
    type: "Isolated Area",
    location: "Near Railway Colony, Mathura",
    risk: "Medium",
    status: "Rejected",
    description:
      "The lane is poorly lit and has very little public activity at night.",
    x: 45,
    y: 68,
  },
  {
    id: "SR-004",
    type: "Open Drain",
    location: "Dampier Nagar, Mathura",
    risk: "Medium",
    status: "Pending",
    description:
      "An open drain cover may create a safety risk for pedestrians.",
    x: 78,
    y: 72,
  },
];

function RiskMap() {
  const [riskFilter, setRiskFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedReport, setSelectedReport] = useState(hazardReports[0]);

  const filteredReports = useMemo(() => {
    return hazardReports.filter((report) => {
      const matchesRisk =
        riskFilter === "All" || report.risk === riskFilter;

      const matchesStatus =
        statusFilter === "All" || report.status === statusFilter;

      return matchesRisk && matchesStatus;
    });
  }, [riskFilter, statusFilter]);

  const counts = {
    High: hazardReports.filter((r) => r.risk === "High").length,
    Medium: hazardReports.filter((r) => r.risk === "Medium").length,
    Low: hazardReports.filter((r) => r.risk === "Low").length,
  };

  const selectRisk = (value) => {
    setRiskFilter(value);
    setSelectedReport(null);
  };

  return (
    <section className="risk-page">
      <div className="risk-intro">
        <div>
          <h2>Community Risk Overview</h2>
          <p>
            Explore reported hazards and their assigned risk levels.
            Locations are illustrative until GPS data is connected.
          </p>
        </div>
        <span className="risk-demo-label">DEMO MAP</span>
      </div>

      <div className="risk-stat-grid">
        <button
          className={`risk-stat high ${riskFilter === "High" ? "selected" : ""}`}
          onClick={() => selectRisk(riskFilter === "High" ? "All" : "High")}
        >
          <span>High risk</span>
          <strong>{counts.High}</strong>
          <small>Requires attention</small>
        </button>

        <button
          className={`risk-stat medium ${riskFilter === "Medium" ? "selected" : ""}`}
          onClick={() =>
            selectRisk(riskFilter === "Medium" ? "All" : "Medium")
          }
        >
          <span>Medium risk</span>
          <strong>{counts.Medium}</strong>
          <small>Monitor closely</small>
        </button>

        <button
          className={`risk-stat low ${riskFilter === "Low" ? "selected" : ""}`}
          onClick={() => selectRisk(riskFilter === "Low" ? "All" : "Low")}
        >
          <span>Low risk</span>
          <strong>{counts.Low}</strong>
          <small>Routine monitoring</small>
        </button>
      </div>

      <div className="risk-filter-bar">
        <label>
          Risk level
          <select
            value={riskFilter}
            onChange={(e) => selectRisk(e.target.value)}
          >
            <option value="All">All risk levels</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </label>

        <label>
          Report status
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setSelectedReport(null);
            }}
          >
            <option value="All">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </label>

        <span className="risk-result-count">
          {filteredReports.length} report(s) found
        </span>
      </div>

      <div className="risk-map-layout">
        <div className="risk-map-card">
          <div className="risk-map-heading">
            <div>
              <h3>Hazard locations</h3>
              <p>Illustrative layout · Mathura</p>
            </div>
            <button
              className="risk-reset-btn"
              onClick={() => {
                setRiskFilter("All");
                setStatusFilter("All");
                setSelectedReport(null);
              }}
            >
              Reset filters
            </button>
          </div>

          <div className="risk-illustration">
            <div className="map-road road-one" />
            <div className="map-road road-two" />
            <div className="map-road road-three" />
            <div className="map-road road-four" />

            <span className="map-area-label area-one">KRISHNA NAGAR</span>
            <span className="map-area-label area-two">JANAKPURI</span>
            <span className="map-area-label area-three">RAILWAY COLONY</span>
            <span className="map-area-label area-four">DAMPIER NAGAR</span>

            {filteredReports.map((report) => (
              <button
                key={report.id}
                className={`risk-marker ${report.risk.toLowerCase()} ${
                  selectedReport?.id === report.id ? "active" : ""
                }`}
                style={{ left: `${report.x}%`, top: `${report.y}%` }}
                onClick={() => setSelectedReport(report)}
                title={`${report.type} - ${report.risk} risk`}
                aria-label={`Select ${report.type} at ${report.location}`}
              >
                !
              </button>
            ))}

            {filteredReports.length === 0 && (
              <div className="risk-no-markers">
                No hazards match these filters.
              </div>
            )}
          </div>

          <div className="risk-legend">
            <span><i className="legend-dot high-dot" /> High risk</span>
            <span><i className="legend-dot medium-dot" /> Medium risk</span>
            <span><i className="legend-dot low-dot" /> Low risk</span>
          </div>
        </div>

        <aside className="risk-details-card">
          <h3>Hazard details</h3>

          {selectedReport && filteredReports.some(
            (report) => report.id === selectedReport.id
          ) ? (
            <>
              <span className={`risk-level-badge ${selectedReport.risk.toLowerCase()}`}>
                {selectedReport.risk} risk
              </span>

              <h4>{selectedReport.type}</h4>
              <p className="risk-report-id">{selectedReport.id}</p>

              <div className="risk-detail-row">
                <span>Location</span>
                <strong>{selectedReport.location}</strong>
              </div>

              <div className="risk-detail-row">
                <span>Report status</span>
                <strong>{selectedReport.status}</strong>
              </div>

              <div className="risk-description">
                <span>Description</span>
                <p>{selectedReport.description}</p>
              </div>
            </>
          ) : (
            <div className="risk-empty-selection">
              <span>⌖</span>
              <p>Select a marker on the map to view its report details.</p>
            </div>
          )}
        </aside>
      </div>

      <div className="risk-reports-card">
        <h3>Filtered hazard reports</h3>
        {filteredReports.length > 0 ? (
          <div className="risk-report-list">
            {filteredReports.map((report) => (
              <button
                key={report.id}
                className={`risk-report-item ${
                  selectedReport?.id === report.id ? "active" : ""
                }`}
                onClick={() => setSelectedReport(report)}
              >
                <span>
                  <strong>{report.type}</strong>
                  <small>{report.location}</small>
                </span>
                <span className={`risk-level-badge ${report.risk.toLowerCase()}`}>
                  {report.risk}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="risk-no-results">
            No reports match the selected filters.
          </p>
        )}
      </div>
    </section>
  );
}

export default RiskMap;
