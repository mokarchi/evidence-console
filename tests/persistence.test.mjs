import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExperimentStore } from "../src/lib/api.js";
import { JsonFilePersistence } from "../src/lib/filePersistence.node.js";
import { demoExperiment } from "../src/data/demoExperiment.js";

test("restores experiments and ingestion state from JSON persistence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evidence-console-"));
  const filePath = join(directory, "experiments.json");
  const persistence = new JsonFilePersistence(filePath);
  const firstStore = new ExperimentStore([], { onChange: (snapshot) => persistence.save(snapshot) });
  firstStore.createExperiment({ ...demoExperiment, id: "exp_persist" });
  firstStore.recordExposure("exp_persist", { subjectId: "persisted_user", eventName: "checkout_view" });
  await firstStore.flush();

  const secondStore = new ExperimentStore();
  secondStore.restore(await persistence.load());
  assert.equal(secondStore.getExperiment("exp_persist").name, demoExperiment.name);
  assert.equal(secondStore.getIngestionSummary("exp_persist").exposures, 1);
  await rm(directory, { recursive: true, force: true });
});
