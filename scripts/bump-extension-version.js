const fs = require("fs");
const path = require("path");

const manifestPath = path.resolve(__dirname, "..", "azure-devops-extension.json");
const manifestRaw = fs.readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestRaw);

const [major, minor, patch] = String(manifest.version || "1.0.0")
  .split(".")
  .map((part) => Number.parseInt(part, 10) || 0);

const nextVersion = `${major}.${minor}.${patch + 1}`;
manifest.version = nextVersion;

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Extension version bumped to ${nextVersion}`);
