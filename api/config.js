const DEFAULT_APPS_SCRIPT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwoBZYkXTRDKhjBA5a6c5JIK34d4tWCc5mmMPG9ItxGms3yideRMqP_YSmlnyC7wjJs/exec";

export default function handler(request, response) {
  response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  response.status(200).json({
    appsScriptUrl: process.env.APPS_SCRIPT_WEB_APP_URL || DEFAULT_APPS_SCRIPT_WEB_APP_URL,
  });
}
