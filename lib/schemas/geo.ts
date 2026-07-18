import { z } from "zod";

import { MAX_ARTICLE_CHARACTERS } from "@/lib/constants/input-limits";

export const paragraphSchema = z.object({
  id: z.string().regex(/^Para-\d+$/),
  text: z.string().min(1).max(800),
});

export const sourceSchema = z.enum(["model", "fallback"]);

export const scoreDimensionSchema = z.object({
  score: z.number().int().min(0),
  max: z.number().int().positive(),
  reason: z.string().trim().min(1).max(300),
});

export const evaluateScoringRequestSchema = z.object({
  title: z.string().trim().min(1, "请输入文章标题").max(120, "标题最多 120 字"),
  content: z
    .string()
    .trim()
    .min(1, "请输入文章正文")
    .max(MAX_ARTICLE_CHARACTERS, "正文最多 12,000 字"),
  publishedAt: z.string().trim().max(32).optional().or(z.literal("")),
});

export const scoringDimensionsSchema = z.object({
  questionCoverage: scoreDimensionSchema.extend({ max: z.literal(35) }),
  factCompleteness: scoreDimensionSchema.extend({ max: z.literal(30) }),
  structureClarity: scoreDimensionSchema.extend({ max: z.literal(20) }),
  freshness: scoreDimensionSchema.extend({ max: z.literal(15) }),
});

export const modelScoringSchema = z.object({
  totalScore: z.number().int().min(0).max(100),
  dimensions: scoringDimensionsSchema,
});

export const evaluateScoringResponseSchema = modelScoringSchema.extend({
  numbered_paragraphs: z.array(paragraphSchema).min(1),
  source: sourceSchema,
});

export const predictQuestionsRequestSchema = z.object({
  title: z.string().trim().min(1).max(120),
  numbered_paragraphs: z.array(paragraphSchema).min(1).max(80),
});

export const modelQuestionsSchema = z.object({
  questions: z.array(z.string().trim().min(6).max(160)).length(5),
});

export const predictQuestionsResponseSchema = modelQuestionsSchema.extend({
  source: sourceSchema,
});

export const answerabilitySchema = z.enum(["可以完全回答", "信息不足", "有风险"]);
export const riskLevelSchema = z.enum(["low", "medium", "high"]);

export const evidenceSchema = z.object({
  paragraphId: z.string().regex(/^Para-\d+$/),
  quote: z.string().trim().min(1).max(400),
});

export const qaDiagnosticRequestSchema = predictQuestionsRequestSchema.extend({
  question: z.string().trim().min(6).max(200),
});

export const modelDiagnosticSchema = z.object({
  question: z.string().trim().min(1).max(200),
  answerability: answerabilitySchema,
  riskLevel: riskLevelSchema,
  evidence: z.array(evidenceSchema).max(3),
  missingInfo: z.array(z.string().trim().min(1).max(120)).max(5),
  recommendation: z.string().trim().min(1).max(500),
});

export const qaDiagnosticResponseSchema = modelDiagnosticSchema.extend({
  source: sourceSchema,
});

export const generatePatchesRequestSchema = predictQuestionsRequestSchema;

export const faqPatchSchema = z.object({
  question: z.string().trim().min(6).max(160),
  answer: z.string().trim().min(1).max(400),
  evidence: evidenceSchema,
});

export const factCardSchema = z.object({
  label: z.string().trim().min(2).max(60),
  value: z.string().trim().min(1).max(400),
  evidence: evidenceSchema,
});

export const modelPatchesSchema = z.object({
  faqs: z.array(faqPatchSchema).min(3).max(5),
  factCards: z.array(factCardSchema).min(3).max(5),
});

export const generatePatchesResponseSchema = modelPatchesSchema.extend({
  markdown: z.string().min(1).max(12_000),
  source: sourceSchema,
});

export type Paragraph = z.infer<typeof paragraphSchema>;
export type EvaluateScoringRequest = z.infer<typeof evaluateScoringRequestSchema>;
export type EvaluateScoringResponse = z.infer<typeof evaluateScoringResponseSchema>;
export type PredictQuestionsResponse = z.infer<typeof predictQuestionsResponseSchema>;
export type DiagnosticResult = z.infer<typeof qaDiagnosticResponseSchema>;
export type GeneratePatchesResponse = z.infer<typeof generatePatchesResponseSchema>;
