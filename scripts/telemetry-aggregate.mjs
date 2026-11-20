import { readFile, writeFile } from "node:fs/promises";
import { aggregateTelemetryImport } from "../src/telemetryReview.js";

const inputIndex = process.argv.indexOf("--input");
const outputIndex = process.argv.indexOf("--output");
if (inputIndex < 0 || !process.argv[inputIndex + 1]) {
  console.error("Usage: npm run telemetry:aggregate -- --input exported-telemetry.json [--min-count 10] [--output path]");
  process.exitCode = 2;
} else {
  try {
    const serialized = await readFile(process.argv[inputIndex + 1], "utf8");
    const minimumIndex = process.argv.indexOf("--min-count");
    const minimumCount = minimumIndex >= 0 ? Number(process.argv[minimumIndex + 1]) : 10;
    const result = aggregateTelemetryImport(serialized, { minimumCount });
    const output = JSON.stringify(result, null, 2) + "\n";
    if (outputIndex >= 0 && process.argv[outputIndex + 1]) await writeFile(process.argv[outputIndex + 1], output, "utf8");
    else process.stdout.write(output);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
