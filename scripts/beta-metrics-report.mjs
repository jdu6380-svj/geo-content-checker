import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
if (!url || !token) {
  console.error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required.");
  process.exit(1);
}

const redis = new Redis({ url, token });
const retentionDays = 90;

function recentUtcDates(days) {
  const today = new Date();
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Array.from({ length: days }, (_, index) =>
    new Date(midnight - index * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10),
  );
}

function dailyKey(metric, date) {
  return `geo:beta:v1:${metric}:${date}`;
}

async function readDailySets(metric, dates) {
  const pipeline = redis.pipeline();
  for (const date of dates) pipeline.smembers(dailyKey(metric, date));
  return pipeline.exec();
}

async function readDailyCounts(metric, dates) {
  return redis.mget(...dates.map((date) => dailyKey(metric, date)));
}

function unionSets(dailySets) {
  const result = new Set();
  for (const values of dailySets) {
    for (const value of Array.isArray(values) ? values : []) result.add(String(value));
  }
  return result;
}

function sumCounts(values) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0);
}

function rate(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;
}

const dates = recentUtcDates(retentionDays);
const [
  visitorDays,
  editorStarterDays,
  analysisStarterDays,
  completerDays,
  reportViewerDays,
  patchRequesterDays,
  patchGeneratorDays,
  patchCopierDays,
  diagnosisFeedbackUserDays,
  feedbackDays,
  editorStartCounts,
  analysisStartCounts,
  analysisCounts,
  reportViewCounts,
  patchRequestCounts,
  patchGenerationCounts,
  patchCopyCounts,
  diagnosisFeedbackCounts,
  diagnosisHelpfulCounts,
  feedbackCounts,
] = await Promise.all([
  readDailySets("visitors", dates),
  readDailySets("editor-starters", dates),
  readDailySets("analysis-starters", dates),
  readDailySets("analysis-completers", dates),
  readDailySets("report-viewers", dates),
  readDailySets("patch-requesters", dates),
  readDailySets("patch-generators", dates),
  readDailySets("patch-copiers", dates),
  readDailySets("diagnosis-feedback-users", dates),
  readDailySets("feedback-users", dates),
  readDailyCounts("editor-start-count", dates),
  readDailyCounts("analysis-start-count", dates),
  readDailyCounts("analysis-count", dates),
  readDailyCounts("report-view-count", dates),
  readDailyCounts("patch-request-count", dates),
  readDailyCounts("patch-generated-count", dates),
  readDailyCounts("patch-copied-count", dates),
  readDailyCounts("diagnosis-feedback-count", dates),
  readDailyCounts("diagnosis-helpful-count", dates),
  readDailyCounts("feedback-count", dates),
]);

const visitors = unionSets(visitorDays);
const editorStarters = unionSets(editorStarterDays);
const analysisStarters = unionSets(analysisStarterDays);
const completers = unionSets(completerDays);
const reportViewers = unionSets(reportViewerDays);
const patchRequesters = unionSets(patchRequesterDays);
const patchGenerators = unionSets(patchGeneratorDays);
const patchCopiers = unionSets(patchCopierDays);
const diagnosisFeedbackUsers = unionSets(diagnosisFeedbackUserDays);
const feedbackUsers = unionSets(feedbackDays);
const completionDatesByUser = new Map();

for (let index = 0; index < completerDays.length; index += 1) {
  for (const value of Array.isArray(completerDays[index]) ? completerDays[index] : []) {
    const anonymousId = String(value);
    const datesForUser = completionDatesByUser.get(anonymousId) || new Set();
    datesForUser.add(dates[index]);
    completionDatesByUser.set(anonymousId, datesForUser);
  }
}

const repeatUsers = Array.from(completionDatesByUser.values()).filter(
  (completionDates) => completionDates.size >= 2,
).length;
const editorStarts = sumCounts(editorStartCounts);
const startedAnalyses = sumCounts(analysisStartCounts);
const completedAnalyses = sumCounts(analysisCounts);
const reportViews = sumCounts(reportViewCounts);
const patchRequests = sumCounts(patchRequestCounts);
const patchGenerations = sumCounts(patchGenerationCounts);
const patchCopies = sumCounts(patchCopyCounts);
const diagnosisFeedbacks = sumCounts(diagnosisFeedbackCounts);
const helpfulDiagnosisFeedbacks = sumCounts(diagnosisHelpfulCounts);
const feedbackClicks = sumCounts(feedbackCounts);

console.log(
  JSON.stringify(
    {
      retentionDays,
      visitors: visitors.size,
      editorStarts,
      uniqueEditorStarters: editorStarters.size,
      editorStartRate: rate(editorStarters.size, visitors.size),
      startedAnalyses,
      uniqueAnalysisStarters: analysisStarters.size,
      completedAnalyses,
      uniqueCompleters: completers.size,
      analysisCompletionRate: rate(completedAnalyses, startedAnalyses),
      activationRate: rate(completers.size, visitors.size),
      reportViews,
      uniqueReportViewers: reportViewers.size,
      reportViewRate: rate(reportViews, completedAnalyses),
      patchRequests,
      uniquePatchRequesters: patchRequesters.size,
      patchGenerations,
      uniquePatchGenerators: patchGenerators.size,
      patchGenerationRate: rate(patchGenerations, patchRequests),
      patchCopies,
      uniquePatchCopiers: patchCopiers.size,
      patchCopyRate: rate(patchCopies, patchGenerations),
      diagnosisFeedbacks,
      helpfulDiagnosisFeedbacks,
      diagnosisFeedbackUsers: diagnosisFeedbackUsers.size,
      diagnosisFeedbackPositiveRate: rate(helpfulDiagnosisFeedbacks, diagnosisFeedbacks),
      repeatUsers,
      repeatRate: rate(repeatUsers, completers.size),
      feedbackUsers: feedbackUsers.size,
      feedbackClicks,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
