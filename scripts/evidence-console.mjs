#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { ExperimentStore } from "../src/lib/api.js";
import { JsonFilePersistence } from "../src/lib/filePersistence.node.js";
import { runExperimentMonitoring, WebhookNotifier } from "../src/lib/monitoring.js";
import { buildExperimentReport, renderMarkdownReport } from "../src/lib/report.js";
import { METRIC_CONTRACT_SCHEMA_VERSION, metricContractSchema, normalizeMetricContract, validateMetricContract } from "../src/lib/metricContract.js";

const DEFAULT_DATA_PATH = ".data/experiments.json";

class CliError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.code = code;
  }
}

function parseArgs(argv) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s);
    const key = rawKey.replaceAll("-", "_");
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      options[key] = argv[index + 1];
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return { options, positionals };
}

function option(options, ...names) {
  return names.map((name) => options[name]).find((value) => value !== undefined);
}

function requiredOption(options, name) {
  const value = option(options, name);
  if (typeof value !== "string" || value.trim() === "") throw new CliError(`--${name.replaceAll("_", "-")} is required`);
  return value.trim();
}

async function readText(filePath) {
  if (!filePath || filePath === "-") {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    return input;
  }
  return readFile(resolve(filePath), "utf8");
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readText(filePath));
  } catch (error) {
    if (error instanceof SyntaxError) throw new CliError(`Invalid JSON input: ${filePath}`);
    throw new CliError(`Could not read JSON input ${filePath}: ${error.message}`);
  }
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function loadStore(dataPath) {
  const resolvedPath = resolve(dataPath ?? DEFAULT_DATA_PATH);
  const persistence = new JsonFilePersistence(resolvedPath);
  const snapshot = await persistence.load();
  if (!snapshot) throw new CliError(`Data file was not found: ${resolvedPath}. Create an experiment before importing or reporting.`);
  const store = new ExperimentStore();
  store.restore(snapshot);
  return { persistence, resolvedPath, store };
}

async function validateCommand(options, positionals) {
  const contractPath = option(options, "contract") ?? positionals[0];
  if (!contractPath) throw new CliError("Provide a contract file with --contract <path> or as the first argument");
  const input = await readJson(contractPath);
  const contract = input?.metricContract && typeof input.metricContract === "object" ? input.metricContract : input;
  const normalized = normalizeMetricContract(contract);
  const result = validateMetricContract(normalized);
  const normalizedLegacyInput = JSON.stringify(contract) !== JSON.stringify(normalized);
  const output = {
    valid: result.valid,
    schemaVersion: result.schemaVersion,
    schema: result.schema ?? metricContractSchema.$id,
    normalized: normalizedLegacyInput,
    errors: result.errors,
  };
  if (options.json) {
    printJson(output);
  } else {
    process.stdout.write(`Metric contract: ${result.valid ? "valid" : "invalid"}\n`);
    process.stdout.write(`Schema: ${result.schemaVersion ?? "unknown"}\n`);
    if (normalizedLegacyInput) process.stdout.write(`Normalization: upgraded to ${METRIC_CONTRACT_SCHEMA_VERSION}\n`);
    if (result.errors.length) process.stdout.write(`Errors:\n${result.errors.map((error) => `- ${error}`).join("\n")}\n`);
  }
  if (!result.valid) process.exitCode = 1;
}

async function importCommand(options, positionals) {
  const experimentId = option(options, "experiment", "id") ?? positionals[0];
  const eventsPath = option(options, "events", "input") ?? positionals[1];
  if (!experimentId) throw new CliError("Provide an experiment with --experiment <id>");
  if (!eventsPath) throw new CliError("Provide an events file with --events <path>");
  const raw = await readText(eventsPath);
  const requestedFormat = option(options, "format");
  const format = String(requestedFormat ?? (extname(eventsPath).slice(1) || "json")).toLowerCase();
  let input;
  if (format === "csv") {
    input = { format: "csv", data: raw };
  } else if (format === "json") {
    const parsed = (() => {
      try {
        return JSON.parse(raw);
      } catch {
        throw new CliError(`Invalid JSON input: ${eventsPath}`);
      }
    })();
    input = { events: Array.isArray(parsed) ? parsed : parsed?.events };
  } else {
    throw new CliError(`Unsupported event format: ${format}. Use json or csv.`);
  }
  const { persistence, resolvedPath, store } = await loadStore(option(options, "data"));
  const result = store.importEvents(experimentId, input);
  await persistence.save(store.snapshot());
  printJson({ ...result, experimentId, dataPath: resolvedPath });
  if (result.skipped > 0) process.exitCode = 1;
}

async function reportCommand(options, positionals) {
  const experimentId = option(options, "experiment", "id") ?? positionals[0];
  if (!experimentId) throw new CliError("Provide an experiment with --experiment <id>");
  const { resolvedPath, store } = await loadStore(option(options, "data"));
  const analysis = store.getAnalysis(experimentId);
  const segmentField = option(options, "segment_field");
  const segmentAnalysis = segmentField ? store.getSegmentAnalysis(experimentId, segmentField) : null;
  const report = buildExperimentReport({ experiment: store.getExperiment(experimentId), analysis: segmentAnalysis ? { ...analysis, segmentAnalysis } : analysis });
  const outputPath = option(options, "output", "out");
  const requestedFormat = option(options, "format");
  const format = String(requestedFormat ?? (outputPath && extname(outputPath).toLowerCase() === ".md" ? "md" : "json")).toLowerCase();
  const content = ["md", "markdown"].includes(format) ? renderMarkdownReport(report) : format === "json" ? `${JSON.stringify(report, null, 2)}\n` : null;
  if (content === null) throw new CliError(`Unsupported report format: ${format}. Use json or md.`);
  if (outputPath) {
    const resolvedOutputPath = resolve(outputPath);
    await writeFile(resolvedOutputPath, content, "utf8");
    printJson({ ok: true, format: format === "markdown" ? "md" : format, outputPath: resolvedOutputPath, reportSchemaVersion: report.schemaVersion, dataPath: resolvedPath });
  } else {
    process.stdout.write(content);
  }
}

async function monitorCommand(options, positionals) {
  const experimentId = option(options, "experiment", "id") ?? positionals[0];
  if (!experimentId) throw new CliError("Provide an experiment with --experiment <id>");
  const { resolvedPath, store } = await loadStore(option(options, "data"));
  const webhookUrl = option(options, "webhook");
  const notifier = webhookUrl ? new WebhookNotifier({ url: webhookUrl }) : undefined;
  const monitor = await runExperimentMonitoring({ experiment: store.getExperiment(experimentId), analysis: store.getAnalysis(experimentId), now: option(options, "now"), notifier });
  printJson({ ...monitor, dataPath: resolvedPath });
  if (["blocked", "review"].includes(monitor.evaluation.status) || monitor.notifications.failures.length > 0) process.exitCode = 1;
}

function printHelp() {
  process.stdout.write(`Evidence Console CLI\n\nUsage:\n  npm run cli -- validate --contract <path> [--json]\n  npm run cli -- import --experiment <id> --events <path> [--format json|csv] [--data <path>]\n  npm run cli -- report --experiment <id> [--format json|md] [--segment-field <field>] [--output <path>] [--data <path>]\n  npm run cli -- monitor --experiment <id> [--now <ISO timestamp>] [--webhook <URL>] [--data <path>]\n\nDefaults:\n  Data file: ${DEFAULT_DATA_PATH}\n  Contract schema: ${METRIC_CONTRACT_SCHEMA_VERSION}\n  JSON report is written to stdout unless --output is provided.\n  monitor returns exit code 1 for blocked/review states or notification failures.\n\nUse - as an input path to read JSON, CSV, or a contract from stdin.\n`);
}

async function main() {
  const command = process.argv[2];
  const { options, positionals } = parseArgs(process.argv.slice(3));
  if (!command || command === "help" || command === "--help" || command === "-h" || options.help) {
    printHelp();
    return;
  }
  if (command === "validate") return validateCommand(options, positionals);
  if (command === "import") return importCommand(options, positionals);
  if (command === "report") return reportCommand(options, positionals);
  if (command === "monitor") return monitorCommand(options, positionals);
  throw new CliError(`Unknown command: ${command}. Use --help for usage.`);
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = error.code ?? 2;
});
