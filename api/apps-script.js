const DEFAULT_APPS_SCRIPT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwsWeRZDYzGV3Y0Dh-FODAQgBuk0s5yiJL-8mturr4NXbjOZxPpKJsvgREKzWm_crqq/exec";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL || DEFAULT_APPS_SCRIPT_WEB_APP_URL;
  try {
    const upstream = await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(request.body || {}),
    });
    const text = await upstream.text();
    try {
      response.status(upstream.ok ? 200 : upstream.status).json(JSON.parse(text));
    } catch {
      response.status(upstream.ok ? 200 : upstream.status).json({ ok: false, error: text || "Apps Script response was not JSON" });
    }
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message || String(error) });
  }
}
