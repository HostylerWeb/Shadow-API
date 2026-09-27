import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(
  readFileSync(path.join(root, "connectors/carrier_x_pod/manifest.schema.json"), "utf8"),
);

function validate(manifest, file) {
  const required = ["connector_id", "connector_version", "graph_version"];
  for (const key of required) {
    if (!manifest[key]) throw new Error(`${file}: missing ${key}`);
  }
  if (schema.properties) {
    for (const [key, spec] of Object.entries(schema.properties)) {
      if (spec.required && manifest[key] === undefined) {
        throw new Error(`${file}: missing required field ${key}`);
      }
    }
  }
}

const connectorsDir = path.join(root, "connectors");
for (const name of readdirSync(connectorsDir)) {
  const manifestPath = path.join(connectorsDir, name, "manifest.json");
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    validate(manifest, manifestPath);
    console.log("ok", manifestPath);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") continue;
    throw err;
  }
}
