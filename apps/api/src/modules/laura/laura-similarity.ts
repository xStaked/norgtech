import jaroWinklerDistance from "jaro-winkler";

export interface SimilarityMatch {
  id: string;
  label: string;
  score: number;
}

const THRESHOLD_HIGH = 0.92;
const THRESHOLD_MEDIUM = 0.82;
const THRESHOLD_AMBIGUOUS = 0.70;

export function similarity(a: string, b: string): number {
  return jaroWinklerDistance(a, b);
}

export function classifyMatch(score: number): "high" | "medium" | "low" | "none" {
  if (score >= THRESHOLD_HIGH) return "high";
  if (score >= THRESHOLD_MEDIUM) return "medium";
  if (score >= THRESHOLD_AMBIGUOUS) return "low";
  return "none";
}

export function isAmbiguous(matches: SimilarityMatch[]): boolean {
  return matches.filter((m) => m.score >= THRESHOLD_AMBIGUOUS).length > 1;
}

export function bestMatch(matches: SimilarityMatch[]): SimilarityMatch | null {
  if (matches.length === 0) return null;
  return matches.reduce((best, current) => (current.score > best.score ? current : best));
}