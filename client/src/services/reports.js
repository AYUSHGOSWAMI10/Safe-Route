const REPORTS_URL = "/api/reports";
const ADMIN_REPORTS_URL = "/api/admin/reports";

async function readResponse(response) {
  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server returned invalid JSON. Status: ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed.");
  }

  return data;
}

async function reportRequest(url, token, options = {}) {
  if (!token) {
    throw new Error("Please log in again to access safety reports.");
  }

  const headers = { Authorization: `Bearer ${token}` };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, { headers, ...options });
  return readResponse(response);
}

export async function getMyReports(token) {
  const data = await reportRequest(REPORTS_URL, token);
  return Array.isArray(data.reports) ? data.reports : [];
}

export async function submitReport(token, { category, location, description }) {
  const data = await reportRequest(REPORTS_URL, token, {
    method: "POST",
    body: JSON.stringify({ category, location, description }),
  });
  return data.report;
}

export async function getAllReports(token) {
  const data = await reportRequest(ADMIN_REPORTS_URL, token);
  return Array.isArray(data.reports) ? data.reports : [];
}

export async function moderateReport(token, id, { status, moderationNote = "" }) {
  const data = await reportRequest(
    `${ADMIN_REPORTS_URL}/${encodeURIComponent(id)}`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ status, moderationNote }),
    }
  );
  return data.report;
}
