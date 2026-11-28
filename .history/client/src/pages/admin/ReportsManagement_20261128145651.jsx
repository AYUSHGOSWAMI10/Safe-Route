
import { useState } from "react";
import "./ReportsManagement.css";

const initialReports = [
  {
    id: "SR-001",
    type: "Broken Streetlight",
    location: "Krishna Nagar, Mathura",
    description: "Streetlight near the main crossing has not been working for several days.",
    date: "2026-11-24",
    status: "Pending",
    reportedBy: "Rahul Sharma",
  },
  {
    id: "SR-002",
    type: "Damaged Road",
    location: "Janakpuri, Mathura",
    description: "A large pothole is making it difficult for vehicles to pass safely.",
    date: "2026-11-23",
    status: "Approved",
    reportedBy: "Priya Singh",
  },
  {
    id: "SR-003",
    type: "Isolated Area",
    location: "Near Railway Colony, Mathura",
    description: "The lane is poorly lit and has very little public activity at night.",
    date: "2026-11-22",
    status: "Rejected",
    reportedBy: "Aman Verma",
    rejectionReason: "The report does not contain enough location details to verify the issue.",
  },
  {
    id: "SR-004",
    type: "Other",
    location: "Dampier Nagar, Mathura",
    description: "An open drain cover may create a safety risk for pedestrians.",
    date: "2026-11-25",
    status: "Pending",
    reportedBy: "Neha Gupta",
  },
];

function ReportsManagement({ onBack }) {
  const [reports, setReports] = useState(initialReports);
  const [filter, setFilter] = useState("All");
  const [selectedReport, setSelectedReport] = useState(null);
  const [rejectingReportId, setRejectingReportId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const filteredReports =
    filter === "All"
      ? reports
      : reports.filter((report) => report.status === filter);

  const updateReportStatus = (id, status, reason = "") => {
    setReports((currentReports) =>
      currentReports.map((report) =>
        report.id === id
          ? {
              ...report,
              status,
              ...(status === "Rejected"
                ? { rejectionReason: reason }
                : {}),
            }
          : report
      )
    );

    setSelectedReport(null);
    setRejectingReportId(null);
    setRejectionReason("");
  };

  const handleReject = (id) => {
    if (!rejectionReason.trim()) {
      return;
    }

    updateReportStatus(id, "Rejected", rejectionReason.trim());
  };

  const counts = {
    All: reports.length,
    Pending: reports.filter((r) => r.status === "Pending").length,
    Approved: reports.filter((r) => r.status === "Approved").length,
    Rejected: reports.filter((r) => r.status === "Rejected").length,
  };

  return (
    <div className="reports-page">
      <div className="reports-heading">
        <div>
          <p className="reports-eyebrow">ADMIN PANEL</p>
          <h1>Reports Management</h1>
          <p className="reports-subtitle">
            Review and manage hazard reports submitted by users.
          </p>
        </div>

        {onBack && (
          <button className="reports-back-btn" onClick={onBack}>
            ← Back to Dashboard
          </button>
        )}
      </div>

      <div className="reports-stats">
        {[
          { label: "Total Reports", value: counts.All },
          { label: "Pending", value: counts.Pending },
          { label: "Approved", value: counts.Approved },
          { label: "Rejected", value: counts.Rejected },
        ].map((item) => (
          <div className="reports-stat-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <section className="reports-table-card">
        <div className="reports-toolbar">
          <div>
            <h2>Submitted Reports</h2>
            <p>Review each report and take appropriate action.</p>
          </div>

          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filter reports by status"
          >
            <option value="All">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>

        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Report ID</th>
                <th>Hazard Type</th>
                <th>Location</th>
                <th>Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredReports.map((report) => (
                <tr key={report.id}>
                  <td className="report-id">{report.id}</td>
                  <td>{report.type}</td>
                  <td>{report.location}</td>
                  <td>{report.date}</td>
                  <td>
                    <span
                      className={`report-status status-${report.status.toLowerCase()}`}
                    >
                      {report.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="report-view-btn"
                      onClick={() => setSelectedReport(report)}
                    >
                      View details
                    </button>
                  </td>
                </tr>
              ))}

              {filteredReports.length === 0 && (
                <tr>
                  <td colSpan="6" className="reports-empty">
                    No reports found in this category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedReport && (
        <div
          className="report-modal-overlay"
          onClick={() => setSelectedReport(null)}
        >
          <section
            className="report-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="report-modal-heading">
              <div>
                <p className="reports-eyebrow">{selectedReport.id}</p>
                <h2>Report Details</h2>
              </div>
              <button
                className="report-close-btn"
                onClick={() => setSelectedReport(null)}
                aria-label="Close report details"
              >
                ×
              </button>
            </div>

            <div className="report-detail-list">
              <div>
                <span>Hazard type</span>
                <strong>{selectedReport.type}</strong>
              </div>
              <div>
                <span>Location</span>
                <strong>{selectedReport.location}</strong>
              </div>
              <div>
                <span>Reported by</span>
                <strong>{selectedReport.reportedBy}</strong>
              </div>
              <div>
                <span>Date submitted</span>
                <strong>{selectedReport.date}</strong>
              </div>
              <div>
                <span>Description</span>
                <p>{selectedReport.description}</p>
              </div>
              <div>
                <span>Current status</span>
                <strong>{selectedReport.status}</strong>
              </div>

              {selectedReport.rejectionReason && (
                <div>
                  <span>Rejection reason</span>
                  <p>{selectedReport.rejectionReason}</p>
                </div>
              )}
            </div>

            {selectedReport.status === "Pending" && (
              <div className="report-review-actions">
                {rejectingReportId === selectedReport.id ? (
                  <>
                    <label htmlFor="rejection-reason">
                      Reason for rejection
                    </label>
                    <textarea
                      id="rejection-reason"
                      value={rejectionReason}
                      onChange={(event) =>
                        setRejectionReason(event.target.value)
                      }
                      placeholder="Explain why this report is being rejected..."
                      rows="3"
                    />
                    <div className="report-action-buttons">
                      <button
                        className="report-cancel-btn"
                        onClick={() => {
                          setRejectingReportId(null);
                          setRejectionReason("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className="report-reject-btn"
                        disabled={!rejectionReason.trim()}
                        onClick={() => handleReject(selectedReport.id)}
                      >
                        Confirm rejection
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="report-action-buttons">
                    <button
                      className="report-reject-btn"
                      onClick={() => setRejectingReportId(selectedReport.id)}
                    >
                      Reject report
                    </button>
                    <button
                      className="report-approve-btn"
                      onClick={() =>
                        updateReportStatus(selectedReport.id, "Approved")
                      }
                    >
                      Approve report
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default ReportsManagement;
