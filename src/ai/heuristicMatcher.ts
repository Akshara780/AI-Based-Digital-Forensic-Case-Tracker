import { Evidence, EvidenceType } from '../types/evidence';

/**
 * ============================================================================
 * CLASSICAL AI: HEURISTIC PATTERN MATCHING & EVIDENCE CORRELATION
 * ============================================================================
 * Explanation for Viva / Evaluation:
 * Heuristic Pattern Matching is a classical rule-based AI technique where expert-defined
 * rules (heuristics) evaluate candidate pairs of items and assign correlation scores.
 *
 * Rather than using deep learning or black-box embeddings, this transparent scoring
 * engine inspects real fields of forensic evidence (IP addresses, devices, timestamps,
 * tags, sources, and compatible evidence types) and calculates a weighted score (0-100).
 */

/**
 * Predefined compatibility map for evidence types.
 * For example: A 'Log File' frequently relates to an 'IP Address', 'Device Information', or 'Timestamp/Event'.
 */
export const COMPATIBLE_EVIDENCE_TYPES: Record<string, EvidenceType[]> = {
  'Log File': ['IP Address', 'Device Information', 'Timestamp/Event', 'URL', 'File'],
  'IP Address': ['Log File', 'Email', 'Device Information', 'URL'],
  'Device Information': ['Log File', 'IP Address', 'Screenshot', 'File'],
  'Email': ['IP Address', 'URL', 'Message', 'Screenshot', 'File'],
  'URL': ['Log File', 'Email', 'IP Address', 'Screenshot', 'Message'],
  'Screenshot': ['Message', 'Email', 'URL', 'Device Information', 'File'],
  'Message': ['Screenshot', 'Email', 'URL', 'Timestamp/Event'],
  'File': ['Log File', 'Email', 'Screenshot', 'Device Information'],
  'Timestamp/Event': ['Log File', 'Message', 'Email', 'Screenshot'],
};

// Interface representing the score result for a single pair of evidence items
export interface EvidencePairScore {
  evidenceAId: string;
  evidenceBId: string;
  score: number;
  reasons: string[];
}

// Extended interface including evidence titles and types for UI/Dev Test display
export interface ScoredEvidencePair extends EvidencePairScore {
  evidenceATitle: string;
  evidenceBTitle: string;
  evidenceAType: EvidenceType;
  evidenceBType: EvidenceType;
}

// Optional configuration options for the heuristic matcher
export interface HeuristicOptions {
  timeWindowMinutes?: number; // Default: 15 minutes
}

/**
 * Calculates a correlation score (0-100) between two evidence items based on heuristic rules.
 *
 * SPEC POINT BREAKDOWN:
 * - Same IP Address: +30
 * - Same Device: +20
 * - Related Timestamp (within configurable window, default 15 minutes): +20
 * - Matching Keywords/Tags (any overlap): +15
 * - Same Source: +10
 * - Related Evidence Type (compatibility map or same type): +5
 * - Cap score at 100 max.
 *
 * @param evidenceA First evidence record
 * @param evidenceB Second evidence record
 * @param options Optional configuration (e.g. time window in minutes)
 * @returns { score: number, reasons: string[] }
 */
export function scoreEvidencePair(
  evidenceA: Evidence,
  evidenceB: Evidence,
  options: HeuristicOptions = {}
): { score: number; reasons: string[] } {
  let points = 0;
  const reasons: string[] = [];
  const timeWindowMinutes = options.timeWindowMinutes ?? 15;

  /*
   * --------------------------------------------------------------------------
   * UNIT BREAKDOWN RULE 1: Same IP Address (+30 points)
   * --------------------------------------------------------------------------
   */
  const ipA = evidenceA.ip_address?.trim().toLowerCase();
  const ipB = evidenceB.ip_address?.trim().toLowerCase();
  if (ipA && ipB && ipA === ipB) {
    points += 30;
    reasons.push(`Same IP address (${evidenceA.ip_address?.trim()})`);
  }

  /*
   * --------------------------------------------------------------------------
   * UNIT BREAKDOWN RULE 2: Same Device (+20 points)
   * --------------------------------------------------------------------------
   */
  const devA = evidenceA.device?.trim().toLowerCase();
  const devB = evidenceB.device?.trim().toLowerCase();
  if (devA && devB && devA === devB) {
    points += 20;
    reasons.push(`Same device (${evidenceA.device?.trim()})`);
  }

  /*
   * --------------------------------------------------------------------------
   * UNIT BREAKDOWN RULE 3: Related Timestamp within time window (+20 points)
   * --------------------------------------------------------------------------
   */
  if (evidenceA.timestamp && evidenceB.timestamp) {
    const timeA = new Date(evidenceA.timestamp).getTime();
    const timeB = new Date(evidenceB.timestamp).getTime();

    if (!isNaN(timeA) && !isNaN(timeB)) {
      const diffMs = Math.abs(timeA - timeB);
      const diffMinutes = diffMs / (1000 * 60);

      if (diffMinutes <= timeWindowMinutes) {
        points += 20;
        const roundedDiff = Math.round(diffMinutes * 10) / 10;
        reasons.push(`Timestamp within ${timeWindowMinutes} minutes (${roundedDiff} mins apart)`);
      }
    }
  }

  /*
   * --------------------------------------------------------------------------
   * UNIT BREAKDOWN RULE 4: Matching Keywords/Tags (+15 points)
   * --------------------------------------------------------------------------
   */
  const tagsA = (evidenceA.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const tagsB = (evidenceB.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const commonTags = tagsA.filter((tag) => tagsB.includes(tag));

  if (commonTags.length > 0) {
    points += 15;
    const uniqueCommon = Array.from(new Set(commonTags));
    reasons.push(`Matching keywords/tags: ${uniqueCommon.join(', ')}`);
  }

  /*
   * --------------------------------------------------------------------------
   * UNIT BREAKDOWN RULE 5: Same Source (+10 points)
   * --------------------------------------------------------------------------
   */
  const srcA = evidenceA.source?.trim().toLowerCase();
  const srcB = evidenceB.source?.trim().toLowerCase();
  if (srcA && srcB && srcA === srcB) {
    points += 10;
    reasons.push(`Same source (${evidenceA.source?.trim()})`);
  }

  /*
   * --------------------------------------------------------------------------
   * UNIT BREAKDOWN RULE 6: Related Evidence Type (+5 points)
   * --------------------------------------------------------------------------
   */
  const typeA = evidenceA.evidence_type;
  const typeB = evidenceB.evidence_type;
  const isSameType = typeA === typeB;
  const isCompatible =
    (COMPATIBLE_EVIDENCE_TYPES[typeA] && COMPATIBLE_EVIDENCE_TYPES[typeA].includes(typeB)) ||
    (COMPATIBLE_EVIDENCE_TYPES[typeB] && COMPATIBLE_EVIDENCE_TYPES[typeB].includes(typeA));

  if (isSameType) {
    points += 5;
    reasons.push(`Same evidence type (${typeA})`);
  } else if (isCompatible) {
    points += 5;
    reasons.push(`Related evidence types (${typeA} & ${typeB})`);
  }

  /*
   * --------------------------------------------------------------------------
   * FINAL CALCULATION: Cap maximum score at 100
   * --------------------------------------------------------------------------
   */
  const finalScore = Math.min(100, points);

  // Optional console.log demonstration to make calculation transparent in console
  if (process.env.NODE_ENV === 'development') {
    console.log(`[HeuristicMatcher] ${evidenceA.title} vs ${evidenceB.title} -> Raw: ${points}, Final: ${finalScore}, Reasons:`, reasons);
  }

  return {
    score: finalScore,
    reasons,
  };
}

/**
 * Compares every pair of evidence items for a case and returns a list sorted by highest score first.
 *
 * @param evidenceList List of evidence items for a case
 * @param options Optional heuristic options (e.g. timeWindowMinutes)
 * @returns Array of ScoredEvidencePair sorted descending by score
 */
export function scoreAllEvidenceForCase(
  evidenceList: Evidence[],
  options: HeuristicOptions = {}
): ScoredEvidencePair[] {
  const scoredPairs: ScoredEvidencePair[] = [];

  for (let i = 0; i < evidenceList.length; i++) {
    for (let j = i + 1; j < evidenceList.length; j++) {
      const evA = evidenceList[i];
      const evB = evidenceList[j];

      const { score, reasons } = scoreEvidencePair(evA, evB, options);

      scoredPairs.push({
        evidenceAId: evA.id,
        evidenceBId: evB.id,
        evidenceATitle: evA.title,
        evidenceBTitle: evB.title,
        evidenceAType: evA.evidence_type,
        evidenceBType: evB.evidence_type,
        score,
        reasons,
      });
    }
  }

  // Sort descending: highest correlation score first
  return scoredPairs.sort((a, b) => b.score - a.score);
}
