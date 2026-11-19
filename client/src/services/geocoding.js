
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export async function searchPlaces(query) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    throw new Error("Please enter a place name.");
  }

  const params = new URLSearchParams({
    q: `${trimmedQuery}, Mathura, Uttar Pradesh, India`,
    format: "jsonv2",
    limit: "5",
    countrycodes: "in",
    addressdetails: "1",
  });

  const response = await fetch(`${NOMINATIM_URL}?${params}`);

  if (!response.ok) {
    throw new Error("Could not search for this place. Please try again.");
  }

  const results = await response.json();

  return results.map((place) => ({
    id: place.place_id,
    name: place.name || place.display_name.split(",")[0],
    address: place.display_name,
    lat: Number(place.lat),
    lng: Number(place.lon),
  }));
}
