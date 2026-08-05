import knowledge from '../data/activityCategoryKnowledge.json';
import type { ActivityCategory } from '../types';

export interface ActivityCategoryGuess {
  primary: ActivityCategory;
  secondary?: ActivityCategory;
  confidence: number;
  ambiguous: boolean;
  scores: Partial<Record<ActivityCategory, number>>;
}

type CategoryExamples = Record<ActivityCategory, string[]>;

interface KeywordBoost {
  pattern: RegExp;
  category: ActivityCategory;
  boost: number;
}

interface ActivityCategoryKnowledge {
  examples: CategoryExamples;
  keywordBoosts: {
    pattern: string;
    category: ActivityCategory;
    boost: number;
  }[];
}

const ACTIVITY_KNOWLEDGE = knowledge as ActivityCategoryKnowledge;

export const ACTIVITY_CATEGORY_EXAMPLES = ACTIVITY_KNOWLEDGE.examples;

export const ACTIVITY_KEYWORD_BOOSTS: KeywordBoost[] = ACTIVITY_KNOWLEDGE.keywordBoosts.map(
  (boost) => ({
    ...boost,
    pattern: new RegExp(boost.pattern, 'i'),
  }),
);

const AUTO_APPLY_CONFIDENCE = 0.58;
const AMBIGUOUS_MARGIN = 0.07;

export function classifyActivityTitle(title: string): ActivityCategoryGuess | null {
  const normalizedTitle = normalizeForUnderstanding(title);

  if (normalizedTitle.length < 2) {
    return null;
  }

  const scores = createEmptyScores();
  const titleTokens = tokenize(normalizedTitle);

  for (const [category, examples] of Object.entries(ACTIVITY_CATEGORY_EXAMPLES) as [
    ActivityCategory,
    string[],
  ][]) {
    scores[category] = Math.max(
      ...examples.map((example) => lexicalSimilarity(titleTokens, example)),
    );
  }

  for (const boost of ACTIVITY_KEYWORD_BOOSTS) {
    if (boost.pattern.test(normalizedTitle)) {
      scores[boost.category] = (scores[boost.category] ?? 0) + boost.boost;
    }
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]) as [ActivityCategory, number][];
  const [primary, primaryScore] = sorted[0];
  const [secondary, secondaryScore] = sorted[1] ?? ['sonstiges', 0];
  const margin = primaryScore - secondaryScore;

  return {
    primary,
    secondary,
    confidence: roundScore(primaryScore),
    ambiguous: primaryScore < AUTO_APPLY_CONFIDENCE || margin < AMBIGUOUS_MARGIN,
    scores,
  };
}

export function shouldAutoApplyCategory(
  guess: ActivityCategoryGuess | null,
): guess is ActivityCategoryGuess {
  return Boolean(guess && !guess.ambiguous && guess.primary !== 'sonstiges');
}

/**
 * Tier 2 of the classifier: an on-device embedding model (e5-small + top3),
 * bundled as an OFFLINE SAFETY NET for slang the lexical tier can't resolve.
 * Registered at app start once the native backend is ready; until then the
 * hybrid path is pure lexical (a graceful no-op). See AGENTS.md.
 */
export interface EmbeddingCategoryClassifier {
  /** True once the model + example vectors are loaded and classify() is usable. */
  readonly ready: boolean;
  classify(title: string): Promise<ActivityCategoryGuess | null>;
}

let embeddingFallback: EmbeddingCategoryClassifier | null = null;

export function registerEmbeddingFallback(classifier: EmbeddingCategoryClassifier | null): void {
  embeddingFallback = classifier;
}

/**
 * Two-tier classification. Tier 1 (lexical) is instant and free and handles the
 * common case (~100% on normal titles); it wins whenever it is confident. Only
 * when Tier 1 is missing/ambiguous AND the embedding fallback is ready do we pay
 * for Tier 2 — so the model runs rarely, on exactly the hard slang it exists for.
 */
export async function classifyActivityTitleHybrid(
  title: string,
): Promise<ActivityCategoryGuess | null> {
  const lexical = classifyActivityTitle(title);
  if (lexical && !lexical.ambiguous) return lexical;
  if (embeddingFallback?.ready) {
    const embedded = await embeddingFallback.classify(title);
    if (embedded && !embedded.ambiguous) return embedded;
    return embedded ?? lexical;
  }
  return lexical;
}

function createEmptyScores(): Record<ActivityCategory, number> {
  return Object.fromEntries(
    Object.keys(ACTIVITY_CATEGORY_EXAMPLES).map((category) => [category, 0]),
  ) as Record<ActivityCategory, number>;
}

function lexicalSimilarity(titleTokens: Set<string>, example: string): number {
  const exampleTokens = tokenize(normalizeForUnderstanding(example));
  const overlap = [...titleTokens].filter((token) => exampleTokens.has(token)).length;
  const phraseBonus = exampleTokens.size > 0 && isSubset(exampleTokens, titleTokens) ? 0.18 : 0;
  const compactTitle = [...titleTokens].join('');
  const compactExample = [...exampleTokens].join('');
  const compoundBonus =
    compactExample.length >= 4 &&
    compactTitle.length >= 4 &&
    (compactTitle.includes(compactExample) || compactExample.includes(compactTitle))
      ? 0.12
      : 0;
  const denominator = Math.max(titleTokens.size, exampleTokens.size, 1);

  return overlap / denominator + phraseBonus + compoundBonus;
}

function isSubset(needles: Set<string>, haystack: Set<string>) {
  for (const needle of needles) {
    if (!haystack.has(needle)) return false;
  }

  return true;
}

function tokenize(input: string) {
  return new Set(input.split(/\s+/).filter(Boolean));
}

/** The ONE normalizer for title matching — the learned category memory reuses
 * it so a remembered title and a classified one can never disagree on casing,
 * umlauts or punctuation. */
export function normalizeForUnderstanding(input: string) {
  return input
    .toLowerCase()
    .replace(/ä|Ã¤/g, 'ae')
    .replace(/ö|Ã¶/g, 'oe')
    .replace(/ü|Ã¼/g, 'ue')
    .replace(/ß|ÃŸ/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function roundScore(score: number) {
  return Math.round(score * 1000) / 1000;
}
