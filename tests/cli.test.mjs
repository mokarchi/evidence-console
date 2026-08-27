import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ExperimentStore } from "../src/lib/api.js";
import { JsonFilePersistence } from "../src/lib/filePersistence.node.js";
import { demoExperiment } from "../src/data/demoExperiment.js";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const cliPath = fileURLToPath(new URL("../scripts/evidence-console.mjs", import.meta.url));

function runCli(args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], { cwd: repositoryRoot, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

test("shows CLI help and validates a contract as JSON", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evidence-console-cli-"));
  try {
    const help = await runCli(["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /validate --contract/);

    const contractPath = join(directory, "contract.json");
    await writeFile(contractPath, `${JSON.stringify(demoExperiment.metricContract)}\n`, "utf8");
    const result = await runCli(["validate", "--contract", contractPath, "--json"]);
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).valid, true);
    assert.equal(JSON.parse(result.stdout).schemaVersion, "evidence-console.metric-contract/v1");

    const invalidPath = join(directory, "invalid-contract.json");
    await writeFile(invalidPath, JSON.stringify({ ...demoExperiment.metricContract, guardrails: { minSampleRatio: 2, maxSrmPValue: 0.01 } }), "utf8");
    const invalid = await runCli(["validate", "--contract", invalidPath, "--json"]);
    assert.equal(invalid.code, 1);
    assert.equal(JSON.parse(invalid.stdout).valid, false);
    assert.match(JSON.parse(invalid.stdout).errors.join("\n"), /guardrails\.minSampleRatio/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("imports JSON and CSV events, then writes a reproducible report", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evidence-console-cli-"));
  try {
    const dataPath = join(directory, "experiments.json");
    const persistence = new JsonFilePersistence(dataPath);
    const store = new ExperimentStore();
    store.createExperiment({ ...demoExperiment, id: "exp_cli" });
    store.createExperiment({ ...demoExperiment, id: "exp_cli_monitor", createdAt: "2026-08-25T00:00:00.000Z" });
    await persistence.save(store.snapshot());

    const monitor = await runCli(["monitor", "--experiment", "exp_cli_monitor", "--data", dataPath, "--now", "2026-08-27T00:00:00.000Z"]);
    assert.equal(monitor.code, 0);
    assert.equal(JSON.parse(monitor.stdout).evaluation.decision, "ship_treatment");
    assert.equal(JSON.parse(monitor.stdout).alerts[0].fingerprint, "exp_cli_monitor:stopped:ship_treatment");

    const eventsPath = join(directory, "events.json");
    await writeFile(eventsPath, JSON.stringify([{ type: "exposure", subjectId: "cli_json_user", eventName: "checkout_view" }]), "utf8");
    const jsonImport = await runCli(["import", "--experiment", "exp_cli", "--events", eventsPath, "--data", dataPath]);
    assert.equal(jsonImport.code, 0);
    assert.equal(JSON.parse(jsonImport.stdout).accepted, 1);

    const csvPath = join(directory, "events.csv");
    await writeFile(csvPath, "type,subject_id,event_name\nexposure,cli_csv_user,checkout_view\n", "utf8");
    const csvImport = await runCli(["import", "--experiment", "exp_cli", "--events", csvPath, "--data", dataPath]);
    assert.equal(csvImport.code, 0);
    assert.equal(JSON.parse(csvImport.stdout).accepted, 1);

    const reportPath = join(directory, "report.md");
    const reportCommand = await runCli(["report", "--experiment", "exp_cli", "--data", dataPath, "--output", reportPath]);
    assert.equal(reportCommand.code, 0);
    assert.equal(JSON.parse(reportCommand.stdout).format, "md");
    const markdown = await readFile(reportPath, "utf8");
    assert.match(markdown, /evidence-console\.metric-contract\/v1/);
    assert.match(markdown, /Assignments: 2/);
    assert.match(markdown, /Contribution LTV/);

    const report = await runCli(["report", "--experiment", "exp_cli", "--data", dataPath, "--format", "json"]);
    assert.equal(report.code, 0);
    assert.equal(JSON.parse(report.stdout).ingestion.exposures, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
