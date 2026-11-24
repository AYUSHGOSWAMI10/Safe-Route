import { useCallback, useEffect, useState } from "react";
import { getAllReports, moderateReport } from "../services/reports.js";
import "./SafetyReports.css";

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function userLabel(report) {
  const user = report.user;
  if (!user) return "Unknown user";
  return user.name || user.email || "Unknown user";
}

export default function AdminReports({ token, onBack }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState({});
  const [updating, setUpdating] = useState({});

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getAllReports(token);
      setReports(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setError(requestError.message || "Unable to load reports.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  function setNote(id, value) {
    setNotes((current) => ({ ...current, [id]: value }));
  }

  async function handleModerate(report, status) {
    setError("");
    setMessage("");

    setUpdating((current) => ({ ...current, [report.id]: true }));

    try {
      const updated = await moderateReport(token, report.id, {
        status,
        moderationNote: notes[report.id] || "",
      });

      setReports((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setNotes((current) => ({ ...current, [report.id]: "" }));
      setMessage(`Report "${report.location}" marked as ${status}.`);
    } catch (requestError) {
      setError(requestError.message || "Could not update review status.");
    } finally {
      setUpdating((current) => ({ ...current, [report.id]: false }));
    }
  }
  return (
    <section className="safety-reports-page" aria-labelledby="admin-reports-title">
      <header className="safety-reports-header">
        <div>
          <p className="safety-reports-eyebrow">COMMUNITY AWARENESS</p>
          <h1 id="admin-reports-title">Safety Reports — Moderation</h1>
          <p>Review and act on safety reports submitted by the community.</p>
        </div>
        <button type="button" className="safety-reports-back" onClick={onBack}>
          Back to planner
        </button>
      </header>

      {error && (
        <p className="safety-report-message safety-report-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="safety-report-message safety-report-success" role="status">
          {message}
        </p>
      )}
      <section className="admin-reports">
        <div className="safety-report-drafts-heading">
          <h2>All reports</h2>
          <span>{reports.length}</span>
        </div>
        {loading ? (
          <p className="safety-report-empty">Loading reports…</p>
        ) : reports.length === 0 ? (
          <p className="safety-report-empty">No reports to review.</p>
        ) : (
          <div className="admin-report-list">
            {reports.map((report) => (
              <article className="admin-report-row" key={report.id}>
                <div className="admin-report-info">
                  <div>
                    <strong>{report.category}</strong>
                    <span
                      className={`safety-report-status safety-report-status-${report.status}`}
                    >
                      {statusLabel(report.status)}
                    </span>
                  </div>
                  <p className="admin-report-location">{report.location}</p>
                  <p>{report.description}</p>
                  <p className="admin-report-meta">
                    Reported by {userLabel(report)} on{" "}
                    {formatDate(report.createdAt)}
                  </p>
                  {report.moderationNote && (
                    <p className="admin-report-note">
                      <strong>Review note:</strong> {report.moderationNote}
                    </p>
                  )}
                </div>
                <div className="admin-report-actions">
                  <select
                    className="admin-status-select"
                    value={report.status}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (["pending", "approved", "rejected"].includes(next)) {
                        setReports((current) =>
                          current.map((item) =>
                            item.id === report.id ? { ...item, status: next } : item
                          )
                        );
                        setNotes((current) => ({
                          ...current,
                          [report.id]: report.moderationNote || "",
                        }));
                      }
                    }}
                  >
                    <option value="pending">Pending review</option>
                    <option value="approved">Approve</option>
                    <option value="rejected">Reject</option>
                  </select>
                  <textarea
                    className="admin-note"
                    value={notes[report.id] || ""}
                    onChange={(event) => setNote(report.id, event.target.value)}
                    placeholder="Moderation note (optional)"
                    rows={2}
                  />
                  <button
                    type="button"
                    className="admin-apply"
                    disabled={updating[report.id]}
                    onClick={() => handleModerate(report, report.status)}
                  >
                    {updating[report.id] ? "Updating…" : "Save review"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <p className="safety-report-emergency">
        If someone is in immediate danger, contact local emergency services. Do
        not approach or confront a person you believe may be dangerous.
      </p>
    </section>
  );
}

function statusLabel(status) {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending review";
}
