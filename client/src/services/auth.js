const API_URL = "/api/auth";

async function authRequest(endpoint, body) {
  const response = await fetch(`${API_URL}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Authentication failed.");
  }

  return data;
}

export function signup({ name, email, password }) {
  return authRequest("signup", { name, email, password });
}

export function login({ email, password }) {
  return authRequest("login", { email, password });
}

export async function getMe(token) {
  const response = await fetch(`${API_URL}/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Session expired. Please log in again.");
  }

  return data.user;
}