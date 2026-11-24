import { useEffect, useState } from "react";
import "./SafetyReports.css";

const KEY = "saferoute_safety_report_drafts";
const CATEGORIES = ["Poor lighting", "Unsafe road", "Isolated area", "Suspicious activity", "Other"];

function loadDrafts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export default function SafetyReports({ onBack }) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [drafts, setDrafts] = useState(loadDrafts);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(drafts)); }
    catch { setMessage("Could not save drafts in this browser."); }
  }, [drafts]);

  function saveDraft(event) {
    event.preventDefault();
    if (!location.trim() || description.trim().length < 10) {
      setMessage("Enter a location and at least 10 characters of description.");
      return;
    }
    const draft = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category, location: location.trim(), description: description.trim(),
      createdAt: new Date().toISOString(),
    };
    setDrafts((current) => [draft, ...current]);
    setLocation("");
    setDescription("");
    setMessage("Saved on this device only. This report has not been submitted or shared.");
  }

  return (
    <section className="safety-reports-page">
      <header className="safety-reports-header">
        <div>
          <p className="safety-reports-eyebrow">COMMUNITY AWARENESS</p>
          <h1>Safety Reports</h1>
          <p>Record a road-safety concern for your own reference.</p>
        </div>
        <button type="button" className="safety-reports-back" onClick={onBack}>Back to planner</button>
      </header>
      <div className="safety-reports-notice">
        <strong>Local drafts only</strong>
        <p>Drafts stay in this browser on this device. They are not sent to SafeRoute, published, or used in route-risk calculations.</p>
      </div>
      <form className="safety-report-form" onSubmit={saveDraft}>
        <h2>Record a concern</h2>
        <label>Concern type
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>Location
          <input value={location} onChange={(event) => setLocation(event.target.value)} maxLength={160} placeholder="Area, street, or nearby landmark" required />
        </label>
        <label>Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={10} maxLength={1000} rows={5} placeholder="Describe the concern (10–1000 characters)" required />
        </label>
        <p className="safety-report-privacy">Avoid names, phone numbers, faces, or other identifying personal details.</p>
        <button type="submit" className="safety-report-submit">Save local draft</button>
        {message && <p className="safety-report-message" role="status">{message}</p>}
      </form>
      <section className="safety-report-drafts">
        <div className="safety-report-drafts-heading"><h2>Your saved drafts</h2><span>{drafts.length}</span></div>
        {drafts.length === 0 ? <p className="safety-report-empty">No drafts saved on this device.</p> : (
          <div className="safety-report-draft-list">
            {drafts.map((draft) => (
              <article className="safety-report-draft" key={draft.id}>
                <div className="safety-report-draft-top">
                  <strong>{draft.category}</strong>
                  <button type="button" onClick={() => setDrafts((items) => items.filter((item) => item.id !== draft.id))}>Delete</button>
                </div>
                <p className="safety-report-draft-location">{draft.location}</p>
                <p>{draft.description}</p>
                <small>{new Date(draft.createdAt).toLocaleString()}</small>
              </article>
            ))}
          </div>
        )}
      </section>
      <p className="safety-report-emergency">If someone is in immediate danger, contact local emergency services. Do not approach or confront a person you believe may be dangerous.</p>
    </section>
  );
}
