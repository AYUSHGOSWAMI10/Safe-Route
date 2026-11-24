
export default function RoutePlanner({
  locations,
  source,
  setSource,
  destination,
  setDestination,
  preference,
  setPreference,
  onSubmit,
  loading,
  error,
}) {
  const preferences = ["Faster", "Balanced", "Safer"];

  return (
    <section className="planner" aria-labelledby="planner-title">
      <h2 id="planner-title">Plan your route</h2>

      <form onSubmit={onSubmit}>
        <div className="form-row">
          <label>
            Starting point

            <select
              value={source}
              onChange={(event) => setSource(event.target.value)}
              required
            >
              <option value="">Select starting point</option>

              {locations.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </label>

          <label>
            Destination

            <select
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              required
            >
              <option value="">Select destination</option>

              {locations.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset>
          <legend>Route preference</legend>

          <div className="preference-options">
            {preferences.map((item) => (
              <button
                key={item}
                type="button"
                className={
                  preference === item
                    ? "preference selected"
                    : "preference"
                }
                onClick={() => setPreference(item)}
                aria-pressed={preference === item}
              >
                {item}
              </button>
            ))}
          </div>
        </fieldset>

        <button
          className="submit-button"
          type="submit"
          disabled={loading || locations.length < 2}
        >
          {loading ? "Finding routes..." : "Find route"}
        </button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}