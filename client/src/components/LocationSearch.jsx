
import { useState } from "react";

export default function LocationSearch({
  label,
  value,
  onChange,
  placeholder,
}) {
  const [query, setQuery] = useState(value || "");

  function handleChange(event) {
    const newValue = event.target.value;
    setQuery(newValue);
    onChange(newValue);
  }

  return (
    <div className="location-search">
      <label>{label}</label>

      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
  );
}
