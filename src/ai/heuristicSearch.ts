import { Evidence } from '../types/evidence';
import { scoreEvidencePair, HeuristicOptions } from './heuristicMatcher';

/**
 * ============================================================================
 * CLASSICAL AI: HEURISTIC BEST-FIRST SEARCH
 * ============================================================================
 * Explanation for Viva / Evaluation:
 *
 * Heuristic Search is a classical AI technique where a "heuristic" (a rule of
 * thumb) guides the search process to find the most relevant results first,
 * rather than exhaustively scanning everything with equal priority.
 *
 * Here, the heuristic is the weighted score from heuristicMatcher.ts.
 * Given a *target* piece of evidence, we search all other evidence in the same
 * case and rank them by how strongly they correlate — modelling the spec's
 * "ranking Evidence A / B / C by relevance %".
 *
 * This is analogous to a Greedy Best-First Search where the heuristic function
 * f(n) = relevance_score(target, candidate).
 */

// Result type returned for each candidate evidence item found by the search
export interface EvidenceSearchResult {
  evidence: Evidence;   // The candidate evidence item
  score: number;        // Heuristic relevance score (0-100)
  reasons: string[];    // Human-readable list of why these two items are related
}

// Options for the heuristic search (extends the matcher's options)
export interface SearchOptions extends HeuristicOptions {
  /**
   * Minimum relevance threshold (0-100).
   * Candidates with a score below this value are excluded from results.
   *
   * Default: 30
   *
   * Why 30?  This models the spec's intent to surface only "meaningfully related"
   * evidence items.  A score of 0-29 typically means the two items share nothing
   * in common (no IP, no device, no tags, no source, only a loose type match at
   * best = 5 pts), so surfacing them would just add noise.
   * Setting the threshold to 30 means at least one strong attribute must match
   * (e.g. same IP address = 30 pts exactly meets the threshold).
   */
  minRelevanceThreshold?: number;
}

/**
 * searchRelatedEvidence
 *
 * Given a single target evidence item, scores every other evidence item in the
 * same case against it using the heuristic matcher, filters out weak matches
 * below the relevance threshold, and returns results sorted highest score first.
 *
 * This is the core "search" function — analogous to a ranked retrieval engine
 * in classical AI information systems.
 *
 * @param targetEvidence  The evidence item we are finding relatives for
 * @param allEvidenceInCase  All evidence items belonging to the same case
 * @param options  Search options including timeWindowMinutes and minRelevanceThreshold
 * @returns Sorted array of EvidenceSearchResult (highest relevance first)
 */
export function searchRelatedEvidence(
  targetEvidence: Evidence,
  allEvidenceInCase: Evidence[],
  options: SearchOptions = {}
): EvidenceSearchResult[] {
  // Default minimum threshold: 30 (matches at least one strong attribute)
  const minRelevanceThreshold = options.minRelevanceThreshold ?? 30;

  const results: EvidenceSearchResult[] = [];

  for (const candidate of allEvidenceInCase) {
    // Skip comparing the target evidence against itself
    if (candidate.id === targetEvidence.id) {
      continue;
    }

    // Score this candidate against the target using the heuristic matcher
    const { score, reasons } = scoreEvidencePair(targetEvidence, candidate, options);

    // Only include candidates that meet the minimum relevance threshold.
    // Weak matches (score < threshold) are excluded to avoid surfacing noise.
    if (score >= minRelevanceThreshold) {
      results.push({ evidence: candidate, score, reasons });
    }
  }

  // Sort descending: most relevant evidence first (best-first ordering)
  results.sort((a, b) => b.score - a.score);

  if (process.env.NODE_ENV === 'development') {
    console.log(
      `[HeuristicSearch] Target: "${targetEvidence.title}" | ` +
      `Found ${results.length} related item(s) above threshold ${minRelevanceThreshold}`
    );
  }

  return results;
}

/**
 * getTopRelatedEvidence
 *
 * A convenience wrapper around searchRelatedEvidence that returns only the
 * top N most relevant results.  Useful for "Related Evidence Found" UI panels
 * where you only want to show a small, curated list.
 *
 * @param targetEvidence  The evidence item we are finding relatives for
 * @param allEvidenceInCase  All evidence items belonging to the same case
 * @param limit  Maximum number of results to return (default: 5)
 * @param options  Search options (timeWindowMinutes, minRelevanceThreshold)
 * @returns Top N EvidenceSearchResult items, sorted by highest score
 */
export function getTopRelatedEvidence(
  targetEvidence: Evidence,
  allEvidenceInCase: Evidence[],
  limit = 5,
  options: SearchOptions = {}
): EvidenceSearchResult[] {
  const allRelated = searchRelatedEvidence(targetEvidence, allEvidenceInCase, options);
  // Slice to the top N results
  return allRelated.slice(0, limit);
}
