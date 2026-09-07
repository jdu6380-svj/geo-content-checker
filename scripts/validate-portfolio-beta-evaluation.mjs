import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const corpusPath = new URL("./fixtures/portfolio-beta-evaluation-corpus.json", import.meta.url);
const corpus = JSON.parse(await readFile(corpusPath, "utf8"));

const contentTypes = new Set(["public_account", "blog_longform", "professional_article"]);
const riskTiers = new Set(["low", "medium", "high"]);
const evidenceStatuses = new Set(["valid", "missing", "invalid"]);
const issueCodes = new Set([
  "baseline_missing",
  "causation_overreach",
  "comparison_criteria_missing",
  "conflicting_version",
  "evidence_complete",
  "guarantee_language",
  "high_stakes_unsupported",
  "jurisdiction_missing",
  "methodology_missing",
  "numerical_conflict",
  "scope_overgeneralized",
  "source_missing",
  "source_unverifiable",
  "stale_or_undated",
]);
const patchCodes = new Set([
  "add_baseline",
  "add_date",
  "add_jurisdiction",
  "add_methodology",
  "add_scope",
  "add_source",
  "define_comparison",
  "identify_source",
  "no_material_change",
  "preserve_caveat",
  "reconcile_numbers",
  "reconcile_version",
  "remove_guarantee",
  "soften_causality",
]);

assert.equal(corpus.schemaVersion, "evidra-portfolio-beta-eval-v1");
assert.equal(corpus.updatedAt, "2026-09-07");
assert.ok(Array.isArray(corpus.items));
assert.equal(corpus.items.length, 20, "Portfolio Beta corpus must contain exactly 20 samples");

const ids = new Set();
const typeCounts = new Map();
const riskCounts = new Map();

for (const [index, item] of corpus.items.entries()) {
  const label = `sample ${index + 1}`;
  assert.match(item.id, /^PB-EVAL-\d{3}$/, `${label} id is invalid`);
  assert.ok(!ids.has(item.id), `${label} id is duplicated`);
  ids.add(item.id);
  assert.ok(contentTypes.has(item.contentType), `${label} contentType is invalid`);
  assert.ok(riskTiers.has(item.riskTier), `${label} riskTier is invalid`);
  assert.equal(typeof item.title, "string", `${label} title is missing`);
  assert.ok(item.title.trim().length >= 4 && item.title.length <= 120, `${label} title length is invalid`);
  assert.equal(typeof item.content, "string", `${label} content is missing`);
  assert.ok(item.content.trim().length >= 80 && item.content.length <= 4_000, `${label} content length is invalid`);
  assert.ok(item.content.includes("\n\n"), `${label} must contain at least two paragraphs`);
  assert.ok(item.reference && typeof item.reference === "object", `${label} reference is missing`);
  assert.ok(issueCodes.has(item.reference.primaryIssueCode), `${label} primaryIssueCode is invalid`);
  assert.ok(Array.isArray(item.reference.mustDetect) && item.reference.mustDetect.length > 0, `${label} mustDetect is empty`);
  assert.ok(item.reference.mustDetect.every((code) => issueCodes.has(code)), `${label} mustDetect contains an invalid code`);
  assert.ok(Array.isArray(item.reference.acceptableEvidenceStatuses) && item.reference.acceptableEvidenceStatuses.length > 0, `${label} evidence statuses are empty`);
  assert.ok(item.reference.acceptableEvidenceStatuses.every((status) => evidenceStatuses.has(status)), `${label} evidence status is invalid`);
  assert.ok(Array.isArray(item.reference.patchRequirementCodes) && item.reference.patchRequirementCodes.length > 0, `${label} patch requirements are empty`);
  assert.ok(item.reference.patchRequirementCodes.every((code) => patchCodes.has(code)), `${label} patch requirement is invalid`);
  typeCounts.set(item.contentType, (typeCounts.get(item.contentType) ?? 0) + 1);
  riskCounts.set(item.riskTier, (riskCounts.get(item.riskTier) ?? 0) + 1);
}

for (const type of contentTypes) assert.ok((typeCounts.get(type) ?? 0) >= 6, `${type} requires at least 6 samples`);
assert.ok((riskCounts.get("low") ?? 0) >= 4, "low risk requires at least 4 samples");
assert.ok((riskCounts.get("medium") ?? 0) >= 4, "medium risk requires at least 4 samples");
assert.ok((riskCounts.get("high") ?? 0) >= 8, "high risk requires at least 8 samples");

console.log(JSON.stringify({
  status: "portfolio_beta_evaluation_corpus_valid",
  samples: corpus.items.length,
  contentTypes: Object.fromEntries(typeCounts),
  riskTiers: Object.fromEntries(riskCounts),
}));
