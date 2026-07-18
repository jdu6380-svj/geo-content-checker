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

function unionSets(dailySets) {
  const result = new Set();
  for (const values of dailySets) {
    for (const value of Array.isArray(values) ? values : []) result.add(String(value));
  }
  return result;
}

const dates = recentUtcDates(retentionDays);
const analysisCountKeys = dates.map((date) => dailyKey("analysis-count", date));
const feedbackCountKeys = dates.map((date) => dailyKey("feedback-count", date));

const [visitorDays, completerDays, feedbackDays, analysisCounts, feedbackCounts] =
  await Promise.all([
    readDailySets("visitors", dates),
    readDailySets("analysis-completers", dates),
    readDailySets("feedback-users", dates),
    redis.mget(...analysisCountKeys),
    redis.mget(...feedbackCountKeys),
  ]);

const visitors = unionSets(visitorDays);
const completers = unionSets(completerDays);
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
const completedAnalyses = analysisCounts.reduce((sum, value) => sum + Number(value || 0), 0);
const feedbackClicks = feedbackCounts.reduce((sum, value) => sum + Number(value || 0), 0);
const activationRate = visitors.size > 0 ? completers.size / visitors.size : 0;
const repeatRate = completers.size > 0 ? repeatUsers / completers.size : 0;

console.log(
  JSON.stringify(
    {
      retentionDays,
      visitors: visitors.size,
      completedAnalyses,
      uniqueCompleters: completers.size,
      activationRate: Number(activationRate.toFixed(4)),
      repeatUsers,
      repeatRate: Number(repeatRate.toFixed(4)),
      feedbackUsers: feedbackUsers.size,
      feedbackClicks,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
