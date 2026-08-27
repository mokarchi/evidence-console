function markdownValue(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export function buildExperimentReport({ experiment, analysis, generatedAt = new Date().toISOString() }) {
  const analysisInput = experiment.analysisInput ?? (experiment.variants && experiment.conversion && experiment.revenue ? {
    variants: experiment.variants,
    conversion: experiment.conversion,
    revenue: experiment.revenue,
  } : null);
  const seed = analysisInput?.conversion?.seed ?? null;
  return {
    schemaVersion: "evidence-console.report/v1",
    generatedAt,
    experiment: {
      id: experiment.id,
      name: experiment.name,
      hypothesis: experiment.hypothesis,
      status: experiment.status ?? "unknown",
      allocation: experiment.allocation,
      metricContract: experiment.metricContract,
      analysisInput,
    },
    ingestion: analysis.ingestion,
    analysis: analysis.result ?? null,
    readiness: { ready: analysis.ready, reason: analysis.reason ?? null },
    reproducibility: {
      bayesianSeed: seed,
      source: "Evidence Console analysis engine",
      rawEventData: analysis.result?.survivalLtv ? "summarized from persisted raw outcome events" : "not included; report contains ingestion summary and configured aggregate inputs",
    },
  };
}

export function renderMarkdownReport(report) {
  const experiment = report.experiment;
  const result = report.analysis;
  const contract = experiment.metricContract;
  const contribution = result?.ltv?.contribution;
  const revenue = result?.ltv?.revenue;
  const conversion = result?.conversion;
  const survivalLtv = result?.survivalLtv;
  const lines = [
    `# Experiment report: ${experiment.name}`,
    "",
    `- Report schema: \`${report.schemaVersion}\``,
    `- Generated at: ${report.generatedAt}`,
    `- Experiment ID: \`${experiment.id}\``,
    `- Status: ${markdownValue(experiment.status)}`,
    `- Allocation: ${experiment.allocation * 100}% control / ${(1 - experiment.allocation) * 100}% treatment`,
    "",
    "## Hypothesis",
    "",
    markdownValue(experiment.hypothesis),
    "",
    "## Metric contract",
    "",
    `- Name: ${markdownValue(contract.name)}`,
    `- Unit: ${markdownValue(contract.unit)}`,
    `- Definition: ${markdownValue(contract.definition)}`,
    `- Numerator: \`${markdownValue(contract.numerator)}\``,
    `- Denominator: \`${markdownValue(contract.denominator)}\``,
    `- Exposure event: \`${markdownValue(contract.exposureEvent)}\``,
    `- Attribution window: ${markdownValue(contract.attributionWindow)}`,
    "",
    "## Ingestion",
    "",
    `- Assignments: ${report.ingestion.assignments}`,
    `- Exposures: ${report.ingestion.exposures}`,
    `- Outcomes: ${report.ingestion.outcomes}`,
    `- Control / Treatment assignments: ${report.ingestion.variants.control} / ${report.ingestion.variants.treatment}`,
    `- Outcome metrics: ${report.ingestion.outcomeMetrics.join(", ") || "none"}`,
    "",
    "## Analysis",
  ];
  if (!result) {
    lines.push("", `Analysis is not ready: ${markdownValue(report.readiness.reason)}`);
  } else {
    if (contribution && revenue && result.variants) {
      lines.push(
        "",
        "### Contribution LTV",
        "",
        "| Variant | LTV |",
        "| --- | ---: |",
        `| Control | $${contribution.control.toFixed(2)} |`,
        `| Treatment | $${contribution.treatment.toFixed(2)} |`,
        `| Difference | $${contribution.difference.toFixed(2)} |`,
        "",
        "### LTV formula trace",
        "",
        "`Contribution LTV = AOV × Purchase Frequency × Expected Lifetime × Contribution Margin`",
        "",
        `- Control AOV: $${result.variants.control.aov.toFixed(2)}`,
        `- Treatment AOV: $${result.variants.treatment.aov.toFixed(2)}`,
        `- Control Purchase Frequency: ${result.variants.control.purchaseFrequency.toFixed(2)}`,
        `- Treatment Purchase Frequency: ${result.variants.treatment.purchaseFrequency.toFixed(2)}`,
        `- Control Expected Lifetime: ${result.variants.control.lifetime.toFixed(2)}`,
        `- Treatment Expected Lifetime: ${result.variants.treatment.lifetime.toFixed(2)}`,
        "",
        "### Revenue LTV",
        "",
        "| Variant | LTV |",
        "| --- | ---: |",
        `| Control | $${revenue.control.toFixed(2)} |`,
        `| Treatment | $${revenue.treatment.toFixed(2)} |`,
        `| Difference | $${revenue.difference.toFixed(2)} |`,
      );
    }
    if (survivalLtv) {
      lines.push(
        "",
        "### Survival-based LTV",
        "",
        "`LTV = Σ [Survival(t) × Expected Contribution Margin(t)]`",
        "",
        "| Variant | LTV |",
        "| --- | ---: |",
        `| Control | $${survivalLtv.control.ltv.toFixed(2)} |`,
        `| Treatment | $${survivalLtv.treatment.ltv.toFixed(2)} |`,
        `| Difference | $${survivalLtv.difference.toFixed(2)} |`,
        `| Relative uplift | ${survivalLtv.relativeUplift === null ? "—" : `${(survivalLtv.relativeUplift * 100).toFixed(2)}%`} |`,
        "",
        `- Control observed subjects: ${survivalLtv.control.subjectCount}`,
        `- Treatment observed subjects: ${survivalLtv.treatment.subjectCount}`,
        `- Control periods in trace: ${survivalLtv.control.components.length}`,
        `- Treatment periods in trace: ${survivalLtv.treatment.components.length}`,
      );
      if (survivalLtv.control.components.every((row) => Number.isFinite(row.survival) && Number.isFinite(row.expectedContribution)) && survivalLtv.treatment.components.every((row) => Number.isFinite(row.survival) && Number.isFinite(row.expectedContribution))) {
        const treatmentByPeriod = new Map(survivalLtv.treatment.components.map((row) => [row.period, row]));
        lines.push(
          "",
          "#### Survival LTV trace",
          "",
          "| Period | Control survival | Control expected contribution | Control component | Treatment survival | Treatment expected contribution | Treatment component |",
          "| ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
          ...survivalLtv.control.components.map((controlRow) => {
            const treatmentRow = treatmentByPeriod.get(controlRow.period);
            return `| ${controlRow.period} | ${controlRow.survival.toFixed(4)} | $${controlRow.expectedContribution.toFixed(2)} | $${controlRow.contribution.toFixed(2)} | ${treatmentRow ? treatmentRow.survival.toFixed(4) : "—"} | ${treatmentRow ? `$${treatmentRow.expectedContribution.toFixed(2)}` : "—"} | ${treatmentRow ? `$${treatmentRow.contribution.toFixed(2)}` : "—"} |`;
          }),
        );
      }
    }
    if (conversion) {
      lines.push(
        "",
        "### Conversion analysis",
        "",
        `- Control rate: ${(conversion.controlRate * 100).toFixed(2)}%`,
        `- Treatment rate: ${(conversion.treatmentRate * 100).toFixed(2)}%`,
        `- Relative uplift: ${conversion.relativeUplift === null ? "—" : `${(conversion.relativeUplift * 100).toFixed(2)}%`}`,
        `- Two-sided p-value: ${conversion.pValue === null ? "—" : conversion.pValue.toFixed(6)}`,
        `- Bayesian P(Treatment > Control): ${(conversion.probabilityTreatmentBetter * 100).toFixed(2)}%`,
      );
    }
    if (result.srm && result.contractStatus) {
      lines.push(
        "",
        "### Data quality",
        "",
        `- SRM p-value: ${result.srm.pValue.toFixed(6)}`,
        `- SRM status: ${result.srm.pass ? "Pass" : "Review"}`,
        `- Metric contract: ${result.contractStatus.valid ? "Valid" : "Invalid"}`,
      );
    }
  }
  lines.push(
    "",
    "## Reproducibility",
    "",
    `- Bayesian seed: ${markdownValue(report.reproducibility.bayesianSeed)}`,
    `- Source: ${report.reproducibility.source}`,
    `- Raw event data: ${report.reproducibility.rawEventData}`,
    "",
    "Generated by Evidence Console.",
    "",
  );
  return lines.join("\n");
}
