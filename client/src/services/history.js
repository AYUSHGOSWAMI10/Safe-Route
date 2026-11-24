const API_URL = "/api/history";

async function readResponse(response) {
  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server returned invalid JSON. Status: ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(data.message || "Unable to access route history.");
  }

  return data;
}

async function historyRequest(path, token) {
  if (!token) {
    throw new Error("Please log in again to view route history.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return readResponse(response);
}

export async function getRouteHistory(token) {
  const data = await historyRequest("", token);
  return Array.isArray(data.history) ? data.history : [];
}

export async function getRouteHistoryItem(token, id) {
  if (!id || typeof id !== "string") {
    throw new Error("Invalid history record.");
  }

  const data = await historyRequest(`/${encodeURIComponent(id)}`, token);
  return data.history;
}
