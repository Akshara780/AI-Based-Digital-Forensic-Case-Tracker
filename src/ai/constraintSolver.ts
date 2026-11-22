import { Evidence } from '../types/evidence';

/**
 * ============================================================================
 * CLASSICAL AI: CONSTRAINT SATISFACTION PROBLEM (CSP) SOLVER
 * ============================================================================
 * Explanation for Viva / Evaluation:
 *
 * Constraint Satisfaction is a classical AI technique where a set of hard
 * rules (constraints) must ALL be satisfied for a result to be considered valid.
 * Unlike heuristic scoring (which gives a 0-100 relevance percentage), constraints
 * are binary: PASS or FAIL.
 *
 * In this forensic context, constraints answer the question:
 *   "Is it even valid/sensible to link Evidence A with Evidence B?"
 *
 * Think of it as a pre-filter before the heuristic scorer runs:
 *   1. Constraint check  →  valid? (yes/no)
 *   2. Heuristic score   →  how relevant? (0-100%)
 *
 * This mirrors Spec Section 13, which defines relationship validity rules:
 *   - Must belong to the same case
 *   - Timestamps must be within a reasonable range (not months apart)
 *   - At least one meaningful attribute must overlap (IP, device, source, or tags)
 */

// Result returned by checkRelationshipConstraints
export interface ConstraintCheckResult {
  valid: boolean;         // true = all constraints passed, false = one or more failed
  violations: string[];   // Human-readable list of failed constraint messages
  passedChecks: string[]; // Human-readable list of constraints that passed (for UI clarity)
}

// Result for a single evidence pair in the batch validation output
export interface PairConstraintResult {
  evidenceAId: string;
  evidenceBId: string;
  evidenceATitle: string;
  evidenceBTitle: string;
  valid: boolean;
  violations: string[];
  passedChecks: string[];
}

// Options for the constraint solver
export interface ConstraintOptions {
  /**
   * Maximum allowed time difference between two evidence timestamps (in hours).
   *
   * Default: 24 hours.
   *
   * Why separate from the 15-minute heuristic window?
   * The heuristic 15-minute window awards *bonus points* for very close timestamps.
   * This 24-hour constraint is a looser *sanity check* — if two items are weeks
   * apart, it's suspicious to link them automatically. This is a PASS/FAIL gate,
   * not a scoring boost.
   */
  maxTimestampDiffHours?: number;
}

/**
 * checkRelationshipConstraints
 *
 * Validates whether linking evidenceA and evidenceB satisfies all hard constraints.
 * Returns { valid, violations, passedChecks }.
 *
 * CONSTRAINTS CHECKED (per Spec Section 13):
 *   1. Same Case:             Both records must share the same case_id.
 *   2. Timestamp Sanity:      Timestamps must be within maxTimestampDiffHours (default 24h).
 *   3. Attribute Overlap:     At least one of: IP address, device, source, or tags must match.
 *
 * @param evidenceA  First evidence record
 * @param evidenceB  Second evidence record
 * @param caseId     The case ID both records should belong to
 * @param options    Optional configuration (e.g. maxTimestampDiffHours)
 */
export function checkRelationshipConstraints(
  evidenceA: Evidence,
  evidenceB: Evidence,
  caseId: string,
  options: ConstraintOptions = {}
): ConstraintCheckResult {
  const maxTimestampDiffHours = options.maxTimestampDiffHours ?? 24;

  const violations: string[] = [];
  const passedChecks: string[] = [];

  // ------------------------------------------------------------------
  // CONSTRAINT 1: Same Case
  // Both evidence items must belong to the same case. This is the most
  // fundamental constraint — you cannot link evidence across different cases.
  // ------------------------------------------------------------------
  const aInCase = evidenceA.case_id === caseId;
  const bInCase = evidenceB.case_id === caseId;

  if (aInCase && bInCase) {
    passedChecks.push('Both evidence items belong to the same case');
  } else {
    if (!aInCase) violations.push(`"${evidenceA.title}" does not belong to case ${caseId}`);
    if (!bInCase) violations.push(`"${evidenceB.title}" does not belong to case ${caseId}`);
  }

  // ------------------------------------------------------------------
  // CONSTRAINT 2: Timestamp Sanity Check (within maxTimestampDiffHours)
  // This is a loose validity gate — not a scoring rule.
  // Example: Two events 3 months apart are unlikely to be directly related.
  // ------------------------------------------------------------------
  if (evidenceA.timestamp && evidenceB.timestamp) {
    const timeA = new Date(evidenceA.timestamp).getTime();
    const timeB = new Date(evidenceB.timestamp).getTime();

    if (!isNaN(timeA) && !isNaN(timeB)) {
      const diffMs = Math.abs(timeA - timeB);
      const diffHours = diffMs / (1000 * 60 * 60);
      const roundedHours = Math.round(diffHours * 10) / 10;

      if (diffHours <= maxTimestampDiffHours) {
        passedChecks.push(
          `Timestamps are within the ${maxTimestampDiffHours}-hour threshold (${roundedHours}h apart)`
        );
      } else {
        violations.push(
          `Timestamp difference exceeds ${maxTimestampDiffHours}-hour threshold (${roundedHours}h apart)`
        );
      }
    } else {
      // If timestamps are present but can't be parsed, treat as a soft warning
      passedChecks.push('Timestamp constraint skipped (unparseable date values)');
    }
  } else {
    // Missing timestamps are not treated as a hard violation — some evidence may
    // not have timestamps (e.g. a device info record). We note this but pass.
    passedChecks.push('Timestamp constraint not applicable (one or both timestamps missing)');
  }

  // ------------------------------------------------------------------
  // CONSTRAINT 3: At Least One Relevant Attribute Matches
  // Linking two evidence items is only meaningful if they share at least one
  // forensically significant attribute: IP address, device, source, or tags.
  //
  // This is CONCEPTUALLY SEPARATE from the heuristic scorer:
  //   - The scorer REWARDS matches with points (gradient: more matches = higher %)
  //   - This constraint REQUIRES at least one match (binary: yes/no)
  // ------------------------------------------------------------------
  let hasAtLeastOneAttributeMatch = false;
  const matchedAttributes: string[] = [];

  // Check shared IP address
  const ipA = evidenceA.ip_address?.trim().toLowerCase();
  const ipB = evidenceB.ip_address?.trim().toLowerCase();
  if (ipA && ipB && ipA === ipB) {
    hasAtLeastOneAttributeMatch = true;
    matchedAttributes.push(`IP address (${evidenceA.ip_address?.trim()})`);
  }

  // Check shared device
  const devA = evidenceA.device?.trim().toLowerCase();
  const devB = evidenceB.device?.trim().toLowerCase();
  if (devA && devB && devA === devB) {
    hasAtLeastOneAttributeMatch = true;
    matchedAttributes.push(`device (${evidenceA.device?.trim()})`);
  }

  // Check shared source
  const srcA = evidenceA.source?.trim().toLowerCase();
  const srcB = evidenceB.source?.trim().toLowerCase();
  if (srcA && srcB && srcA === srcB) {
    hasAtLeastOneAttributeMatch = true;
    matchedAttributes.push(`source (${evidenceA.source?.trim()})`);
  }

  // Check overlapping tags
  const tagsA = (evidenceA.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const tagsB = (evidenceB.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const sharedTags = tagsA.filter((tag) => tagsB.includes(tag));
  if (sharedTags.length > 0) {
    hasAtLeastOneAttributeMatch = true;
    matchedAttributes.push(`tags (${Array.from(new Set(sharedTags)).join(', ')})`);
  }

  if (hasAtLeastOneAttributeMatch) {
    passedChecks.push(`Shared attribute(s) found: ${matchedAttributes.join('; ')}`);
  } else {
    violations.push(
      'Insufficient relationship evidence: no shared IP address, device, source, or tags'
    );
  }

  return {
    valid: violations.length === 0,
    violations,
    passedChecks,
  };
}

/**
 * validateAllRelationshipsForCase
 *
 * Runs the constraint check across every unique pair of evidence items in a case.
 * Returns a summary list showing which pairs pass or fail and why.
 *
 * This is the batch version — useful for an overview of a case's entire
 * evidence relationship validity.
 *
 * @param evidenceList  All evidence items for the case
 * @param caseId        The case ID they belong to
 * @param options       Optional constraint options
 * @returns Array of PairConstraintResult sorted: failing pairs first (so problems are visible)
 */
export function validateAllRelationshipsForCase(
  evidenceList: Evidence[],
  caseId: string,
  options: ConstraintOptions = {}
): PairConstraintResult[] {
  const results: PairConstraintResult[] = [];

  for (let i = 0; i < evidenceList.length; i++) {
    for (let j = i + 1; j < evidenceList.length; j++) {
      const evA = evidenceList[i];
      const evB = evidenceList[j];

      const { valid, violations, passedChecks } = checkRelationshipConstraints(
        evA,
        evB,
        caseId,
        options
      );

      results.push({
        evidenceAId: evA.id,
        evidenceBId: evB.id,
        evidenceATitle: evA.title,
        evidenceBTitle: evB.title,
        valid,
        violations,
        passedChecks,
      });
    }
  }

  // Sort: failing pairs first (most critical issues at the top), then passing
  results.sort((a, b) => {
    if (a.valid === b.valid) return 0;
    return a.valid ? 1 : -1;
  });

  if (process.env.NODE_ENV === 'development') {
    const passing = results.filter((r) => r.valid).length;
    const failing = results.filter((r) => !r.valid).length;
    console.log(
      `[ConstraintSolver] Case ${caseId}: ${results.length} pairs checked — ${passing} valid, ${failing} invalid`
    );
  }

  return results;
}
