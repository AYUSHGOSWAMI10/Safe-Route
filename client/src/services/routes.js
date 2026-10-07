export async function getLocations() {
  const response = await fetch("/api/routes");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load locations.");
  return data.locations;
}

export async function findRoutes(search) {
  const response = await fetch("/api/routes/find", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(search),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not find routes.");
  return data;
}
