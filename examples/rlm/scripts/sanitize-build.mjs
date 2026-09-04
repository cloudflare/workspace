import { readdir, readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
const localSecretNames = /^(?:\.dev\.vars(?:\..*)?|\.env(?:\..*)?)$/;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

let files = await walk(dist);
for (const path of files) {
  if (basename(path) === ".dev.vars") await rm(path, { force: true });
}

files = await walk(dist);
const leakedFiles = files.filter((path) => localSecretNames.test(basename(path)));
if (leakedFiles.length > 0) {
  throw new Error(`Local secret files remain in the production build: ${leakedFiles.join(", ")}`);
}

const rootEntries = await readdir(root, { withFileTypes: true });
const localSecretFiles = rootEntries
  .filter((entry) => entry.isFile() && localSecretNames.test(entry.name))
  .map((entry) => join(root, entry.name));
const values = [];
for (const path of localSecretFiles) {
  const contents = await readFile(path, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const value = unquote(match[2] ?? "");
    if (key && value.length >= 8 && !/^your[-_]/i.test(value)) values.push({ key, value, path });
  }
}
for (const path of files) {
  const contents = await readFile(path);
  for (const secret of values) {
    if (contents.includes(Buffer.from(secret.value))) {
      throw new Error(
        `Value from ${basename(secret.path)} key ${secret.key} appears in production file ${path}.`,
      );
    }
  }
}

console.log("Verified production output contains no local secret files or values.");

function unquote(value) {
  if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
    return value.slice(1, -1);
  }
  return value;
}
