import { useCallback, useEffect, useState } from "react";
import { getMyReports, submitReport } from "../services/reports.js";
import "./SafetyReports.css";

const CATEGORIES = ["Poor lighting", "Unsafe road", "Isolated area", "Suspicious activity", "Other"];

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(status) {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending review";
}

export default function SafetyReports({ token, user, onBack }) {
  const isDemo = user?.id === "demo-user";
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [fieldError, setFieldError] = useState("");

  const loadReports = useCallback(async () => {
    if (isDemo) {
      setReports([]);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await getMyReports(token);
      setReports(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setError(requestError.message || "Unable to load your reports.");
    } finally {
      setLoading(false);
    }
  }, [isDemo, token]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setMessage("");
    setFieldError("");

    if (!CATEGORIES.includes(category)) {
      setFieldError("Choose a valid concern type.");
      return;
    }

    const cleanLocation = location.trim();
    if (!cleanLocation) {
      setFieldError("Location is required.");
      return;
    }
    if (cleanLocation.length > 200) {
      setFieldError("Location must be 200 characters or fewer.");
      return;
    }

    const cleanDescription = description.trim();
    if (cleanDescription.length < 10) {
      setFieldError("Description must be at least 10 characters.");
      return;
    }
    if (cleanDescription.length > 1000) {
      setFieldError("Description must be 1000 characters or fewer.");
      return;
    }

    setSubmitting(true);

    try {
      const report = await submitReport(token, {
        category,
        location: cleanLocation,
        description: cleanDescription,
      });

      setReports((current) => [report, ...current]);
      setLocation("");
      setDescription("");
      setMessage("Your safety report has been submitted and is pending review.");
    } catch (requestError) {
      setError(requestError.message || "Could not submit your report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="safety-reports-page" aria-labelledby="safety-reports-title">
      <header className="safety-reports-header">
        <div>
          <p className="safety-reports-eyebrow">COMMUNITY AWARENESS</p>
          <h1 id="safety-reports-title">Safety Reports</h1>
          <p>
            {isDemo
              ? "Submit and track safety concerns with your SafeRoute account."
              : "Report a road-safety concern and track its review status."}
          </p>
        </div>
        <button type="button" className="safety-reports-back" onClick={onBack}>
          Back to planner
        </button>
      </header>

      {isDemo ? (
        <div className="safety-reports-notice">
          <strong>Reports unavailable in Demo mode</strong>
          <p>
            Sign in with your SafeRoute account to submit safety reports and
            track their review status.
          </p>
        </div>
      ) : (
        <>
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
          <form className="safety-report-form" onSubmit={handleSubmit}>
            <h2>Report a concern</h2>
            <label>
              Concern type
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                required
              >
                {CATEGORIES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Location
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                maxLength={200}
                placeholder="Area, street, or nearby landmark"
                required
              />
            </label>
            <label>
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                minLength={10}
                maxLength={1000}
                rows={5}
                placeholder="Describe the concern (10–1000 characters)"
                required
              />
            </label>
            {fieldError && (
              <p className="safety-report-message safety-report-error" role="alert">
                {fieldError}
              </p>
            )}
            <p className="safety-report-privacy">
              Avoid names, phone numbers, faces, or other identifying personal
              details.
            </p>
            <button
              type="submit"
              className="safety-report-submit"
              disabled={submitting}
            >
              {submitting ? "Submitting…" : "Submit report"}
            </button>
          </form>
          <section className="safety-report-list">
            <div className="safety-report-drafts-heading">
              <h2>Your reports</h2>
              <span>{reports.length}</span>
            </div>
            {loading ? (
              <p className="safety-report-empty">Loading your reports…</p>
            ) : reports.length === 0 ? (
              <p className="safety-report-empty">
                No reports yet. Submit your first safety concern above.
              </p>
            ) : (
              <div className="safety-report-list-items">
                {reports.map((report) => (
                  <article className="safety-report-item" key={report.id}>
                    <div className="safety-report-item-top">
                      <div>
                        <strong>{report.category}</strong>
                        <span
                          className={`safety-report-status safety-report-status-${report.status}`}
                        >
                          {statusLabel(report.status)}
                        </span>
                      </div>
                    </div>
                    <p className="safety-report-item-location">{report.location}</p>
                    <p>{report.description}</p>
                    {report.moderationNote && (
                      <div className="safety-report-moderation">
                        <strong>Review note:</strong>{" "}
                        {report.moderationNote}
                      </div>
                    )}
                    <small>{formatDate(report.createdAt)}</small>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      <p className="safety-report-emergency">
        If someone is in immediate danger, contact local emergency services. Do
        not approach or confront a person you believe may be dangerous.
      </p>
    </section>
  );
}
