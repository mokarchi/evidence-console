function markdownValue(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function formatInterval(interval) {
  return Array.isArray(interval) && interval.length === 2 && interval.every((value) => Number.isFinite(value)) ? `[$${interval[0].toFixed(2)}, $${interval[1].toFixed(2)}]` : "—";
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
    metricContractSchemaVersion: experiment.metricContract?.schemaVersion ?? null,
    generatedAt,
    experiment: {
      id: experiment.id,
      name: experiment.name,
      hypothesis: experiment.hypothesis,
      status: experiment.status ?? "unknown",
      allocation: experiment.allocation,
      metricContract: experiment.metricContract,
      stoppingRule: experiment.stoppingRule ?? null,
      analysisInput,
    },
    ingestion: analysis.ingestion,
    analysis: analysis.result ?? null,
    segmentAnalysis: analysis.segmentAnalysis ?? null,
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
    `- Metric Contract schema: \`${report.metricContractSchemaVersion ?? "unknown"}\``,
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
    "## Stopping rule",
    "",
    `- Schema: \`${experiment.stoppingRule?.schemaVersion ?? "unknown"}\``,
    `- Minimum sample: ${markdownValue(experiment.stoppingRule?.minSampleSize)}`,
    `- Minimum / maximum runtime: ${markdownValue(experiment.stoppingRule?.minimumRuntimeHours)}h / ${markdownValue(experiment.stoppingRule?.maximumRuntimeHours)}h`,
    `- P(Treatment better) threshold: ${experiment.stoppingRule?.minProbabilityTreatmentBetter === undefined ? "—" : `${(experiment.stoppingRule.minProbabilityTreatmentBetter * 100).toFixed(1)}%`}`,
    `- Practical uplift threshold: ${experiment.stoppingRule?.minRelativeUplift === undefined ? "—" : `${(experiment.stoppingRule.minRelativeUplift * 100).toFixed(1)}%`}`,
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
      );
      if (survivalLtv.uncertainty) {
        const confidencePercent = `${(survivalLtv.uncertainty.confidenceLevel * 100).toFixed(0)}%`;
        lines.push(
          `| Variant | LTV | ${confidencePercent} bootstrap interval |`,
          "| --- | ---: | ---: |",
          `| Control | $${survivalLtv.control.ltv.toFixed(2)} | ${formatInterval(survivalLtv.uncertainty.control.interval)} |`,
          `| Treatment | $${survivalLtv.treatment.ltv.toFixed(2)} | ${formatInterval(survivalLtv.uncertainty.treatment.interval)} |`,
          `| Difference | $${survivalLtv.difference.toFixed(2)} | ${formatInterval(survivalLtv.uncertainty.difference.interval)} |`,
          `| Relative uplift | ${survivalLtv.relativeUplift === null ? "—" : `${(survivalLtv.relativeUplift * 100).toFixed(2)}%`} | — |`,
        );
      } else {
        lines.push(
          "| Variant | LTV |",
          "| --- | ---: |",
          `| Control | $${survivalLtv.control.ltv.toFixed(2)} |`,
          `| Treatment | $${survivalLtv.treatment.ltv.toFixed(2)} |`,
          `| Difference | $${survivalLtv.difference.toFixed(2)} |`,
          `| Relative uplift | ${survivalLtv.relativeUplift === null ? "—" : `${(survivalLtv.relativeUplift * 100).toFixed(2)}%`} |`,
        );
      }
      lines.push(
        "",
        `- Control observed subjects: ${survivalLtv.control.subjectCount}`,
        `- Treatment observed subjects: ${survivalLtv.treatment.subjectCount}`,
        `- Control periods in trace: ${survivalLtv.control.components.length}`,
        `- Treatment periods in trace: ${survivalLtv.treatment.components.length}`,
        ...(survivalLtv.uncertainty ? [
          `- Uncertainty: ${survivalLtv.uncertainty.method}, ${survivalLtv.uncertainty.draws.toLocaleString()} draws, seed ${survivalLtv.uncertainty.seed}`,
          `- Bootstrap standard error (difference): $${survivalLtv.uncertainty.difference.standardError.toFixed(2)}`,
        ] : []),
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
    ...(report.segmentAnalysis?.segments?.length ? [
      "",
      "## Segment analysis",
      "",
      `- Dimension: ${report.segmentAnalysis.field}`,
      `- Multiple-comparison correction: ${report.segmentAnalysis.correction} at α = ${report.segmentAnalysis.alpha}`,
      `- Tested subgroups: ${report.segmentAnalysis.testedSegments}`,
      `- Ambiguous subjects excluded: ${report.segmentAnalysis.excludedAmbiguousSubjects}`,
      "",
      "| Segment | Control LTV | Treatment LTV | Difference | Adjusted p-value | Decision |",
      "| --- | ---: | ---: | ---: | ---: | --- |",
      ...report.segmentAnalysis.segments.map((segment) => `| ${segment.value} | $${segment.control.ltv.toFixed(2)} | $${segment.treatment.ltv.toFixed(2)} | $${segment.difference.toFixed(2)} | ${segment.adjustedPValue.toFixed(4)} | ${segment.significant ? "Significant" : "Review"} |`),
    ] : []),
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
