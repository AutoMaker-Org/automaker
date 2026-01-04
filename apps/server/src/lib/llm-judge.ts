/**
 * LLM-as-a-Judge utilities for evaluating agent outputs.
 *
 * Implements direct scoring, pairwise comparison, and rubric generation
 * using the existing provider architecture.
 */

import { ProviderFactory } from '../providers/provider-factory.js';
import type { ExecuteOptions } from '../providers/types.js';
import { createLogger } from '@automaker/utils';
import {
  CLAUDE_MODEL_MAP,
  CURSOR_MODEL_MAP,
  OPENCODE_MODEL_MAP,
  CODEX_MODEL_MAP,
  DEFAULT_MODELS,
} from '@automaker/types';
import { resolveModelString } from '@automaker/model-resolver';

const logger = createLogger('LlmJudge');

export type RubricScale = '1-3' | '1-5' | '1-10';

export interface JudgeRunConfig {
  cwd: string;
  model?: string;
  maxTurns?: number;
  abortController?: AbortController;
}

export interface DirectScoreInput {
  response: string;
  prompt: string;
  context?: string;
  criteria: Array<{ name: string; description: string; weight?: number }>;
  rubric?: {
    scale: RubricScale;
    levelDescriptions?: Record<string, string>;
  };
}

export interface DirectScoreOutput {
  success: boolean;
  scores: Array<{
    criterion: string;
    score: number;
    maxScore: number;
    justification: string;
    evidence: string[];
    improvement: string;
  }>;
  overallScore: number;
  weightedScore: number;
  summary: {
    assessment: string;
    strengths: string[];
    weaknesses: string[];
    priorities: string[];
  };
  metadata: {
    evaluationTimeMs: number;
    model: string;
    criteriaCount: number;
  };
}

export interface PairwiseCompareInput {
  responseA: string;
  responseB: string;
  prompt: string;
  context?: string;
  criteria: string[];
  allowTie?: boolean;
  swapPositions?: boolean;
}

export interface PairwiseCompareOutput {
  success: boolean;
  winner: 'A' | 'B' | 'TIE';
  confidence: number;
  comparison: Array<{
    criterion: string;
    winner: 'A' | 'B' | 'TIE';
    aAssessment: string;
    bAssessment: string;
    reasoning: string;
  }>;
  analysis: {
    responseA: { strengths: string[]; weaknesses: string[] };
    responseB: { strengths: string[]; weaknesses: string[] };
  };
  differentiators: string[];
  positionConsistency?: {
    consistent: boolean;
    firstPassWinner?: 'A' | 'B' | 'TIE';
    secondPassWinner?: 'A' | 'B' | 'TIE';
  };
  metadata: {
    evaluationTimeMs: number;
    model: string;
    positionsSwapped: boolean;
  };
}

export interface GenerateRubricInput {
  criterionName: string;
  criterionDescription: string;
  scale?: RubricScale;
  domain?: string;
  includeExamples?: boolean;
  strictness?: 'lenient' | 'balanced' | 'strict';
}

export interface GenerateRubricOutput {
  success: boolean;
  criterion: {
    name: string;
    description: string;
  };
  scale: {
    min: number;
    max: number;
    type: RubricScale;
  };
  levels: Array<{
    score: number;
    label: string;
    description: string;
    characteristics: string[];
    example?: string;
  }>;
  scoringGuidelines: string[];
  edgeCases: Array<{ situation: string; guidance: string }>;
  metadata: {
    domain: string | null;
    strictness: string;
    generationTimeMs: number;
  };
}

function getDefaultJudgeModel(): string {
  const envModel = process.env.AUTOMAKER_MODEL_JUDGE;
  if (envModel) {
    return resolveModelString(envModel);
  }

  const defaultProvider = ProviderFactory.getDefaultProvider();
  if (defaultProvider === 'cursor') {
    return resolveModelString(CURSOR_MODEL_MAP.auto);
  }
  if (defaultProvider === 'opencode') {
    return resolveModelString(OPENCODE_MODEL_MAP['glm4.7'] || DEFAULT_MODELS.opencode);
  }
  if (defaultProvider === 'codex') {
    return resolveModelString(CODEX_MODEL_MAP['gpt-5.2-codex'] || DEFAULT_MODELS.codex);
  }
  return resolveModelString(CLAUDE_MODEL_MAP.haiku);
}

function getJudgeMaxTurns(): number {
  const raw = process.env.AUTOMAKER_JUDGE_MAX_TURNS;
  if (!raw) {
    return 8;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
}

async function collectProviderText(stream: AsyncGenerator<any>): Promise<string> {
  let responseText = '';

  for await (const msg of stream) {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) {
          responseText += block.text;
        }
      }
    } else if (msg.type === 'result' && msg.subtype === 'success') {
      if (typeof msg.result === 'string') {
        responseText = msg.result;
      }
    } else if (msg.type === 'error') {
      throw new Error(msg.error || 'LLM judge error');
    }
  }

  return responseText.trim();
}

function extractJsonBlock(text: string): string | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
    return text.slice(objectStart, objectEnd + 1).trim();
  }

  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    return text.slice(arrayStart, arrayEnd + 1).trim();
  }

  return null;
}

function parseJsonSafe<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const extracted = extractJsonBlock(text);
    if (!extracted) {
      return null;
    }
    try {
      return JSON.parse(extracted) as T;
    } catch {
      return null;
    }
  }
}

async function runJudgePrompt(
  prompt: string,
  systemPrompt: string,
  config: JudgeRunConfig
): Promise<string> {
  const model = resolveModelString(config.model, getDefaultJudgeModel());
  const provider = ProviderFactory.getProviderForModel(model);

  const options: ExecuteOptions = {
    prompt,
    model,
    cwd: config.cwd,
    systemPrompt,
    maxTurns: config.maxTurns ?? getJudgeMaxTurns(),
    allowedTools: ['Read'],
    abortController: config.abortController,
  };

  const stream = provider.executeQuery(options);
  return collectProviderText(stream);
}

export async function runJudgeText(
  prompt: string,
  systemPrompt: string,
  config: JudgeRunConfig
): Promise<string> {
  return runJudgePrompt(prompt, systemPrompt, config);
}

export async function directScore(
  input: DirectScoreInput,
  config: JudgeRunConfig
): Promise<DirectScoreOutput> {
  const startTime = Date.now();
  const scale = input.rubric?.scale || '1-5';
  const maxScore = Number.parseInt(scale.split('-')[1], 10);

  const systemPrompt = `You are an expert evaluator. Assess the response against each criterion.
For each criterion:
1. Find specific evidence in the response
2. Score according to the rubric (1-${maxScore} scale)
3. Justify your score
4. Suggest one improvement

Be objective and consistent. Base scores on explicit evidence.`;

  const userPrompt = `## Original Prompt
${input.prompt}

${input.context ? `## Context\n${input.context}\n` : ''}## Response to Evaluate
${input.response}

## Criteria
${input.criteria
  .map((c, i) => `${i + 1}. **${c.name}** (weight: ${c.weight ?? 1}): ${c.description}`)
  .join('\n')}

${
  input.rubric?.levelDescriptions
    ? `## Rubric\n${Object.entries(input.rubric.levelDescriptions)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')}`
    : ''
}

Respond with valid JSON matching this structure:
{
  "scores": [
    {
      "criterion": "criterion name",
      "score": number,
      "evidence": ["quote or observation 1", "quote 2"],
      "justification": "why this score",
      "improvement": "specific suggestion"
    }
  ],
  "summary": {
    "assessment": "overall quality summary",
    "strengths": ["strength 1", "strength 2"],
    "weaknesses": ["weakness 1"],
    "priorities": ["most important improvement"]
  }
}`;

  try {
    const responseText = await runJudgePrompt(userPrompt, systemPrompt, config);
    const parsed = parseJsonSafe<{
      scores: Array<{
        criterion: string;
        score: number;
        evidence?: string[];
        justification: string;
        improvement: string;
      }>;
      summary: {
        assessment: string;
        strengths: string[];
        weaknesses: string[];
        priorities: string[];
      };
    }>(responseText);

    if (!parsed?.scores?.length || !parsed.summary) {
      throw new Error('Invalid judge response');
    }

    const totalWeight = input.criteria.reduce((sum, c) => sum + (c.weight ?? 1), 0);
    const weightedSum = parsed.scores.reduce((sum, score) => {
      const criterion = input.criteria.find((c) => c.name === score.criterion);
      return sum + score.score * (criterion?.weight ?? 1);
    }, 0);

    const overallScore =
      parsed.scores.reduce((sum, score) => sum + score.score, 0) / parsed.scores.length;
    const weightedScore = weightedSum / totalWeight;

    return {
      success: true,
      scores: parsed.scores.map((score) => ({
        ...score,
        maxScore,
        evidence: score.evidence ?? [],
      })),
      overallScore: Math.round(overallScore * 100) / 100,
      weightedScore: Math.round(weightedScore * 100) / 100,
      summary: parsed.summary,
      metadata: {
        evaluationTimeMs: Date.now() - startTime,
        model: resolveModelString(config.model, getDefaultJudgeModel()),
        criteriaCount: input.criteria.length,
      },
    };
  } catch (error) {
    logger.warn('Direct score failed', { error: error instanceof Error ? error.message : error });
    return {
      success: false,
      scores: [],
      overallScore: 0,
      weightedScore: 0,
      summary: {
        assessment: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        strengths: [],
        weaknesses: [],
        priorities: [],
      },
      metadata: {
        evaluationTimeMs: Date.now() - startTime,
        model: resolveModelString(config.model, getDefaultJudgeModel()),
        criteriaCount: input.criteria.length,
      },
    };
  }
}

async function evaluatePair(
  first: string,
  second: string,
  prompt: string,
  criteria: string[],
  context: string | undefined,
  allowTie: boolean,
  config: JudgeRunConfig
): Promise<{
  winner: 'A' | 'B' | 'TIE';
  confidence: number;
  comparison: PairwiseCompareOutput['comparison'];
  analysis: PairwiseCompareOutput['analysis'];
}> {
  const systemPrompt = `You are an expert evaluator comparing two AI responses.

IMPORTANT:
- Do NOT prefer responses because they are longer
- Do NOT prefer responses based on position (first vs second)
- Focus only on quality according to the criteria
- ${allowTie ? 'Ties are acceptable when responses are genuinely equivalent' : 'You must choose a winner'}`;

  const userPrompt = `## Original Prompt
${prompt}

${context ? `## Context\n${context}\n` : ''}## Response A
${first}

## Response B
${second}

## Criteria to Compare
${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

First analyze each response independently, then compare them.
Respond with valid JSON:
{
  "analysis": {
    "responseA": { "strengths": [...], "weaknesses": [...] },
    "responseB": { "strengths": [...], "weaknesses": [...] }
  },
  "comparison": [
    {
      "criterion": "criterion name",
      "winner": "A" | "B" | "TIE",
      "aAssessment": "brief assessment of A",
      "bAssessment": "brief assessment of B",
      "reasoning": "why this winner"
    }
  ],
  "result": {
    "winner": "A" | "B" | "TIE",
    "confidence": 0.0-1.0,
    "reasoning": "overall reasoning"
  }
}`;

  const responseText = await runJudgePrompt(userPrompt, systemPrompt, config);
  const parsed = parseJsonSafe<{
    analysis: PairwiseCompareOutput['analysis'];
    comparison: PairwiseCompareOutput['comparison'];
    result: { winner: 'A' | 'B' | 'TIE'; confidence: number };
  }>(responseText);

  if (!parsed?.comparison || !parsed.result) {
    throw new Error('Invalid judge comparison response');
  }

  return {
    winner: parsed.result.winner,
    confidence: parsed.result.confidence,
    comparison: parsed.comparison,
    analysis: parsed.analysis,
  };
}

export async function pairwiseCompare(
  input: PairwiseCompareInput,
  config: JudgeRunConfig
): Promise<PairwiseCompareOutput> {
  const startTime = Date.now();
  const allowTie = input.allowTie ?? true;
  const swapPositions = input.swapPositions ?? true;

  try {
    if (swapPositions) {
      const pass1 = await evaluatePair(
        input.responseA,
        input.responseB,
        input.prompt,
        input.criteria,
        input.context,
        allowTie,
        config
      );
      const pass2 = await evaluatePair(
        input.responseB,
        input.responseA,
        input.prompt,
        input.criteria,
        input.context,
        allowTie,
        config
      );

      const pass2WinnerMapped = pass2.winner === 'A' ? 'B' : pass2.winner === 'B' ? 'A' : 'TIE';
      const consistent = pass1.winner === pass2WinnerMapped;

      let finalWinner: 'A' | 'B' | 'TIE' = 'TIE';
      let finalConfidence = 0.5;

      if (consistent) {
        finalWinner = pass1.winner;
        finalConfidence = (pass1.confidence + pass2.confidence) / 2;
      }

      const mergedComparison = pass1.comparison.map((entry, index) => {
        const entry2 = pass2.comparison[index];
        const mapped = entry2.winner === 'A' ? 'B' : entry2.winner === 'B' ? 'A' : 'TIE';
        return {
          ...entry,
          winner: entry.winner === mapped ? entry.winner : 'TIE',
        };
      });

      const differentiators = mergedComparison
        .filter((entry) => entry.winner !== 'TIE')
        .map(
          (entry) =>
            `${entry.criterion}: ${entry.winner === 'A' ? 'Response A' : 'Response B'} wins - ${entry.reasoning}`
        );

      return {
        success: true,
        winner: finalWinner,
        confidence: Math.round(finalConfidence * 100) / 100,
        comparison: mergedComparison,
        analysis: pass1.analysis,
        differentiators,
        positionConsistency: {
          consistent,
          firstPassWinner: pass1.winner,
          secondPassWinner: pass2WinnerMapped,
        },
        metadata: {
          evaluationTimeMs: Date.now() - startTime,
          model: resolveModelString(config.model, getDefaultJudgeModel()),
          positionsSwapped: true,
        },
      };
    }

    const result = await evaluatePair(
      input.responseA,
      input.responseB,
      input.prompt,
      input.criteria,
      input.context,
      allowTie,
      config
    );

    const differentiators = result.comparison
      .filter((entry) => entry.winner !== 'TIE')
      .map(
        (entry) =>
          `${entry.criterion}: ${entry.winner === 'A' ? 'Response A' : 'Response B'} wins - ${entry.reasoning}`
      );

    return {
      success: true,
      winner: result.winner,
      confidence: result.confidence,
      comparison: result.comparison,
      analysis: result.analysis,
      differentiators,
      metadata: {
        evaluationTimeMs: Date.now() - startTime,
        model: resolveModelString(config.model, getDefaultJudgeModel()),
        positionsSwapped: false,
      },
    };
  } catch (error) {
    logger.warn('Pairwise compare failed', {
      error: error instanceof Error ? error.message : error,
    });
    return {
      success: false,
      winner: 'TIE',
      confidence: 0,
      comparison: [],
      analysis: {
        responseA: { strengths: [], weaknesses: [] },
        responseB: { strengths: [], weaknesses: [] },
      },
      differentiators: [],
      metadata: {
        evaluationTimeMs: Date.now() - startTime,
        model: resolveModelString(config.model, getDefaultJudgeModel()),
        positionsSwapped: swapPositions,
      },
    };
  }
}

export async function generateRubric(
  input: GenerateRubricInput,
  config: JudgeRunConfig
): Promise<GenerateRubricOutput> {
  const startTime = Date.now();
  const scale = input.scale ?? '1-5';
  const [minScore, maxScore] = scale.split('-').map((value) => Number.parseInt(value, 10));
  const strictness = input.strictness ?? 'balanced';
  const includeExamples = input.includeExamples ?? true;

  const systemPrompt = `You are an expert in creating evaluation rubrics.
Create clear, actionable rubrics with distinct boundaries between levels.
Strictness: ${strictness}
- lenient: Lower bar for passing scores
- balanced: Fair, typical expectations
- strict: High standards, critical evaluation`;

  const userPrompt = `Create a scoring rubric for:

**Criterion**: ${input.criterionName}
**Description**: ${input.criterionDescription}
**Scale**: ${scale} (${minScore} = lowest, ${maxScore} = highest)
${input.domain ? `**Domain**: ${input.domain}` : ''}
**Include Examples**: ${includeExamples}

Generate a rubric with:
1. Clear descriptions for each score level
2. Specific characteristics that define each level
3. ${includeExamples ? 'Brief example text for each level' : 'No examples needed'}
4. General scoring guidelines
5. Edge cases with guidance

Respond with valid JSON:
{
  "levels": [
    {
      "score": ${minScore},
      "label": "Label (e.g., Poor)",
      "description": "Detailed description of this level",
      "characteristics": ["characteristic 1", "characteristic 2"],
      "example": ${includeExamples ? '"Brief example text"' : 'null'}
    }
  ],
  "scoringGuidelines": [
    "General guideline 1",
    "General guideline 2"
  ],
  "edgeCases": [
    {
      "situation": "Edge case description",
      "guidance": "How to handle it"
    }
  ]
}`;

  try {
    const responseText = await runJudgePrompt(userPrompt, systemPrompt, config);
    const parsed = parseJsonSafe<{
      levels: GenerateRubricOutput['levels'];
      scoringGuidelines: string[];
      edgeCases: Array<{ situation: string; guidance: string }>;
    }>(responseText);

    if (!parsed?.levels) {
      throw new Error('Invalid rubric response');
    }

    return {
      success: true,
      criterion: {
        name: input.criterionName,
        description: input.criterionDescription,
      },
      scale: {
        min: minScore,
        max: maxScore,
        type: scale,
      },
      levels: parsed.levels,
      scoringGuidelines: parsed.scoringGuidelines ?? [],
      edgeCases: parsed.edgeCases ?? [],
      metadata: {
        domain: input.domain ?? null,
        strictness,
        generationTimeMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    logger.warn('Generate rubric failed', {
      error: error instanceof Error ? error.message : error,
    });
    return {
      success: false,
      criterion: {
        name: input.criterionName,
        description: input.criterionDescription,
      },
      scale: {
        min: minScore,
        max: maxScore,
        type: scale,
      },
      levels: [],
      scoringGuidelines: [],
      edgeCases: [],
      metadata: {
        domain: input.domain ?? null,
        strictness,
        generationTimeMs: Date.now() - startTime,
      },
    };
  }
}
