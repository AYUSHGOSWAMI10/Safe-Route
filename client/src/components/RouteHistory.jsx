import { useCallback, useEffect, useState } from "react";
import {
  getRouteHistory,
  getRouteHistoryItem,
} from "../services/history.js";
import "./RouteHistory.css";

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function formatPreference(value) {
  if (value === "faster") return "Faster";
  if (value === "safer") return "Safer";
  return "Balanced";
}

function formatNumber(value, digits = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "—";
}

export default function RouteHistory({ token, isDemo, onBack }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const loadHistory = useCallback(async () => {
    if (isDemo) {
      setItems([]);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const history = await getRouteHistory(token);
      setItems(history);
    } catch (requestError) {
      setError(requestError.message || "Unable to load route history.");
    } finally {
      setLoading(false);
    }
  }, [isDemo, token]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function openItem(id) {
    setSelectedItem(null);
    setDetailError("");
    setDetailLoading(true);

    try {
      const item = await getRouteHistoryItem(token, id);
      setSelectedItem(item);
    } catch (requestError) {
      setDetailError(requestError.message || "Unable to load this history record.");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <section className="history-page" aria-labelledby="history-title">
      <div className="history-page-heading">
        <div>
          <p className="history-eyebrow">YOUR JOURNEYS</p>
          <h1 id="history-title">Route History</h1>
          <p className="history-subtitle">
            Review routes saved to your SafeRoute account.
          </p>
        </div>
        <div className="history-heading-actions">
          {!isDemo && (
            <button
              type="button"
              className="history-refresh-button"
              onClick={loadHistory}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
          )}
          <button type="button" className="history-back-button" onClick={onBack}>
            ← Back to planner
          </button>
        </div>
      </div>

      {isDemo ? (
        <div className="history-message history-info" role="status">
          <strong>History is unavailable in Demo mode.</strong>
          <p>Sign in with your account to view your saved journeys.</p>
        </div>
      ) : selectedItem ? (
        <article className="history-detail panel">
          <button
            type="button"
            className="history-text-button"
            onClick={() => setSelectedItem(null)}
          >
            ← Back to all journeys
          </button>
          <p className="history-detail-date">{formatDate(selectedItem.createdAt)}</p>
          <h2>{selectedItem.source}</h2>
          <div className="history-destination-line" aria-hidden="true">↓</div>
          <h2>{selectedItem.destination}</h2>
          <div className="history-detail-grid">
            <div><span>Selected route</span><strong>{selectedItem.selectedRoute}</strong></div>
            <div><span>Preference</span><strong>{formatPreference(selectedItem.preference)}</strong></div>
            <div><span>Distance</span><strong>{formatNumber(selectedItem.distance)} km</strong></div>
            <div><span>Estimated time</span><strong>{formatNumber(selectedItem.estimatedTime, 0)} min</strong></div>
            <div><span>Safety score</span><strong>{formatNumber(selectedItem.safetyScore, 0)}/100</strong></div>
          </div>
        </article>
      ) : (
        <>
          {detailLoading && <div className="history-message">Loading journey details…</div>}
          {detailError && <div className="history-message history-error" role="alert">{detailError}</div>}
          {loading ? (
            <div className="history-message">Loading your route history…</div>
          ) : error ? (
            <div className="history-message history-error" role="alert">
              <p>{error}</p>
              <button type="button" className="history-retry-button" onClick={loadHistory}>Try again</button>
            </div>
          ) : items.length === 0 ? (
            <div className="history-empty panel">
              <div className="history-empty-icon" aria-hidden="true">◷</div>
              <h2>No saved journeys yet</h2>
              <p>There are no saved journeys on this account yet. New route saving will be connected when the planner returns live route results.</p>
              <button type="button" className="history-retry-button" onClick={onBack}>
                Plan a route
              </button>
            </div>
          ) : (
            <div className="history-list" aria-label="Saved journeys">
              {items.map((item) => (
                <article className="history-card panel" key={item._id}>
                  <div className="history-card-main">
                    <p className="history-card-date">{formatDate(item.createdAt)}</p>
                    <h2>{item.source}</h2>
                    <div className="history-destination-line" aria-hidden="true">↓</div>
                    <h2>{item.destination}</h2>
                    <div className="history-card-meta">
                      <span>{formatPreference(item.preference)}</span>
                      <span>{formatNumber(item.distance)} km</span>
                      <span>{formatNumber(item.estimatedTime, 0)} min</span>
                    </div>
                  </div>
                  <div className="history-card-side">
                    <span className="history-score-label">Safety score</span>
                    <strong>{formatNumber(item.safetyScore, 0)}<small>/100</small></strong>
                    <button type="button" className="history-view-button" onClick={() => openItem(item._id)}>
                      View details →
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
