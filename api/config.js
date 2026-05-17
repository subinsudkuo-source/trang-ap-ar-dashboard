export default function handler(request, response) {
  response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  response.status(200).json({
    appsScriptUrl: process.env.APPS_SCRIPT_WEB_APP_URL || "",
  });
}
