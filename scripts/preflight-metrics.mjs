import { readFile, writeFile } from "node:fs/promises";
import { parseCsv } from "../src/clinicalMetrics.js";
import { calculatePreflightMetrics, parsePreflightCsv } from "../src/preflightMetrics.js";

const inputIndex = process.argv.indexOf("--input");
const outputIndex = process.argv.indexOf("--output");
if (inputIndex < 0 || !process.argv[inputIndex + 1]) {
  console.error("Usage: npm run preflight:metrics -- --input path/to/deidentified.csv [--output path]");
  process.exitCode = 2;
} else {
  try {
    const result = calculatePreflightMetrics(parsePreflightCsv(await readFile(process.argv[inputIndex + 1], "utf8"), parseCsv));
    const output = JSON.stringify(result, null, 2) + "\n";
    if (outputIndex >= 0 && process.argv[outputIndex + 1]) await writeFile(process.argv[outputIndex + 1], output, "utf8");
    else process.stdout.write(output);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
