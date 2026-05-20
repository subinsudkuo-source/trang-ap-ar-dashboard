const DEFAULT_APPS_SCRIPT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwsWeRZDYzGV3Y0Dh-FODAQgBuk0s5yiJL-8mturr4NXbjOZxPpKJsvgREKzWm_crqq/exec";

export default function handler(request, response) {
  response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  response.status(200).json({
    appsScriptUrl: process.env.APPS_SCRIPT_WEB_APP_URL || DEFAULT_APPS_SCRIPT_WEB_APP_URL,
  });
}
