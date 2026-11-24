
import { useEffect, useState } from "react";
import { searchPlaces } from "../services/geocoding";

export default function LocationSearch({
  label,
  value,
  onChange,
  onSelect,
  placeholder,
}) {
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Keep the input synchronized when a location is selected on the map.
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  // Search for places while the user types.
  useEffect(() => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    let active = true;

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError("");

        const results = await searchPlaces(query);

        if (active) {
          setSuggestions(results);
          setShowSuggestions(true);
        }
      } catch (err) {
        if (active) {
          setSuggestions([]);
          setError(err.message || "Unable to search locations.");
          setShowSuggestions(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  function handleChange(event) {
    const newValue = event.target.value;

    setQuery(newValue);
    setSuggestions([]);
    setError("");
    onChange(newValue);
  }

  function handleSelect(place) {
    setQuery(place.name);
    setSuggestions([]);
    setShowSuggestions(false);
    onSelect(place);
  }

  return (
    <div className="location-search">
      <label>{label}</label>

      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => {
          if (suggestions.length > 0) setShowSuggestions(true);
        }}
        placeholder={placeholder}
        autoComplete="off"
      />

      {loading && <p className="search-status">Searching places...</p>}

      {showSuggestions && suggestions.length > 0 && (
        <div className="suggestion-list">
          {suggestions.map((place) => (
            <button
              type="button"
              key={place.id}
              className="suggestion-item"
              onClick={() => handleSelect(place)}
            >
              <strong>{place.name}</strong>
              <small>{place.address}</small>
            </button>
          ))}
        </div>
      )}

      {showSuggestions && error && (
        <p className="search-status">{error}</p>
      )}

      {showSuggestions &&
        !loading &&
        !error &&
        query.trim().length >= 3 &&
        suggestions.length === 0 && (
          <p className="search-status">No matching places found.</p>
        )}
    </div>
  );
}