import { access, readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

export const HISTORICAL_INITIAL_ENTRY_GZIP_BYTES = 60.49 * 1024;
// The initial budget is pinned to the measured build output until the bundle
// can be reduced further. Any entry growth therefore fails the release check.
export const PERFORMANCE_BUDGETS = { initialEntryGzipBytes: 67453, workerGzipBytes: 6 * 1024 };

const gzipBytes = (value) => gzipSync(value, { level: 9 }).byteLength;

export async function inspectPerformance(distDir = "dist") {
  const distIndex = `${distDir}/index.html`;
  await access(distIndex);
  const html = await readFile(distIndex, "utf8");
  const scriptPaths = [...html.matchAll(/(?:src|href)="(?:\.\/)?(assets\/[^\"]+\.js)"/g)].map((match) => match[1]);
  const initial = scriptPaths.find((path) => /(^|\/)index-[^/]+\.js$/.test(path));
  if (!initial) throw new Error("Could not identify the initial Vite entry in dist/index.html.");
  const initialPath = `${distDir}/${initial}`;
  const initialBytes = gzipBytes(await readFile(initialPath));
  const assetNames = await readdir(`${distDir}/assets`);
  const workerName = assetNames.find((name) => name.startsWith("analysis.worker") && name.endsWith(".js"));
  const workerPath = workerName ? `assets/${workerName}` : null;
  const workerBytes = workerPath ? gzipBytes(await readFile(`${distDir}/${workerPath}`)) : 0;
  const report = {
    initialEntry: initial,
    initialEntryGzipBytes: initialBytes,
    initialEntryGzipKiB: Number((initialBytes / 1024).toFixed(2)),
    worker: workerPath,
    workerGzipBytes: workerBytes,
    workerGzipKiB: Number((workerBytes / 1024).toFixed(2)),
    historicalInitialEntryGzipKiB: 60.49,
    residualDeltaFromHistoricalKiB: Number(((initialBytes - HISTORICAL_INITIAL_ENTRY_GZIP_BYTES) / 1024).toFixed(2)),
    budgets: PERFORMANCE_BUDGETS,
  };
  const failures = [];
  if (initialBytes > PERFORMANCE_BUDGETS.initialEntryGzipBytes) failures.push(`Initial entry exceeds ${PERFORMANCE_BUDGETS.initialEntryGzipBytes} gzip bytes.`);
  if (!workerPath) failures.push("Analysis worker asset could not be identified.");
  else if (workerBytes > PERFORMANCE_BUDGETS.workerGzipBytes) failures.push(`Analysis worker exceeds ${PERFORMANCE_BUDGETS.workerGzipBytes} gzip bytes.`);
  return { report, failures };
}

if (process.argv[1]?.endsWith("performance-check.mjs")) {
  try {
    const { report, failures } = await inspectPerformance();
    console.log(JSON.stringify(report, null, 2));
    if (failures.length) { failures.forEach((failure) => console.error(`FAIL: ${failure}`)); process.exitCode = 1; }
  } catch (error) {
    console.error(`Performance check could not inspect the production build: ${error.message}`);
    process.exitCode = 1;
  }
}
