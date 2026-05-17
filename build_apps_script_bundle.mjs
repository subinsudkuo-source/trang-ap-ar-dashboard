import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const appsScriptDir = join(root, "apps_script");
const outputsDir = join(root, "outputs");

mkdirSync(outputsDir, { recursive: true });

const css = readFileSync(join(root, "webapp", "styles.css"), "utf8");
const data = readFileSync(join(root, "webapp", "data.example.js"), "utf8");
const app = readFileSync(join(root, "webapp", "app.js"), "utf8");

writeFileSync(join(appsScriptDir, "Styles.html"), `<style>\n${css}\n</style>\n`);
writeFileSync(join(appsScriptDir, "Client.html"), `<script>\n${data}\n${app}\n</script>\n`);

execFileSync("zip", [
  "-qr",
  join(outputsDir, "apps_script_backend_bundle.zip"),
  "apps_script",
], { cwd: root });

console.log("Updated apps_script/Styles.html");
console.log("Updated apps_script/Client.html");
console.log("Created outputs/apps_script_backend_bundle.zip");
