import { Evidence } from '../types/evidence';
import { searchRelatedEvidence } from './heuristicSearch';

/**
 * ==========================================================================
 * CLASSICAL AI: BACKWARD CHAINING
 * ==========================================================================
 * Explanation for Viva / Evaluation:
 * Backward chaining is goal-driven: start from a hypothesis, work backward
 * checking what facts and supporting evidence are needed to justify it.
 *
 * In a forensic workflow, this helps answer targeted questions such as whether
 * a specific item is linked to suspicious activity based on evidence in the case.
 */

export interface BackwardCheckStep {
  question: string;
  result: boolean;
  detail: string;
}

export type BackwardConclusion =
  | 'Strong Support'
  | 'Moderate Support'
  | 'Weak Support'
  | 'Insufficient Evidence';

export interface BackwardChainingResult {
  hypothesis: string;
  steps: BackwardCheckStep[];
  conclusion: BackwardConclusion;
}

const TIME_WINDOW_MINUTES = 15;

function parseTimestamp(dateValue?: string): number | null {
  if (!dateValue) return null;
  const parsed = new Date(dateValue).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function inferKeywordSupport(targetEvidence: Evidence, relatedEvidence: Evidence[]): boolean {
  const targetText = [targetEvidence.title, targetEvidence.description, targetEvidence.source, ...(targetEvidence.tags || [])]
    .join(' ')
    .toLowerCase();

  for (const item of relatedEvidence) {
    const combined = [item.title, item.description, item.source, ...(item.tags || [])]
      .join(' ')
      .toLowerCase();

    const suspiciousTerms = [
      'suspicious',
      'login',
      'failed',
      'unknown',
      'malware',
      'intrusion',
      'unauthorized',
      'attack',
      'phishing',
      'anomaly',
      'access',
      'breach',
    ];

    if (targetText.includes('suspicious') || combined.includes('suspicious')) {
      return true;
    }

    const hasTerm = suspiciousTerms.some((term) => targetText.includes(term) || combined.includes(term));
    if (hasTerm) {
      return true;
    }
  }

  return false;
}

export function investigateHypothesis(
  hypothesis: string,
  targetEvidence: Evidence,
  allEvidenceInCase: Evidence[]
): BackwardChainingResult {
  const steps: BackwardCheckStep[] = [];

  if (hypothesis !== 'Is this evidence related to suspicious activity?') {
    return {
      hypothesis,
      steps: [
        {
          question: 'Hypothesis is not recognized by this backward checker.',
          result: false,
          detail: 'Only the suspicious-activity hypothesis is supported in this AI module.',
        },
      ],
      conclusion: 'Insufficient Evidence',
    };
  }

  const related = searchRelatedEvidence(targetEvidence, allEvidenceInCase, {
    timeWindowMinutes: TIME_WINDOW_MINUTES,
    minRelevanceThreshold: 30,
  });

  const sameIp = allEvidenceInCase.some((other) => {
    if (other.id === targetEvidence.id) return false;
    return !!targetEvidence.ip_address && !!other.ip_address && targetEvidence.ip_address.trim().toLowerCase() === other.ip_address.trim().toLowerCase();
  });

  const sameDevice = allEvidenceInCase.some((other) => {
    if (other.id === targetEvidence.id) return false;
    return !!targetEvidence.device && !!other.device && targetEvidence.device.trim().toLowerCase() === other.device.trim().toLowerCase();
  });

  const closeTimestamp = allEvidenceInCase.some((other) => {
    if (other.id === targetEvidence.id) return false;
    const targetTs = parseTimestamp(targetEvidence.timestamp);
    const otherTs = parseTimestamp(other.timestamp);
    if (targetTs === null || otherTs === null) return false;
    return Math.abs(targetTs - otherTs) <= TIME_WINDOW_MINUTES * 60 * 1000;
  });

  const keywordMatch = inferKeywordSupport(targetEvidence, allEvidenceInCase.filter((other) => other.id !== targetEvidence.id));
  const supportingEvidenceExists = related.length > 0;

  const checks = [
    {
      question: 'Does this evidence share an IP address with another record in the case?',
      result: sameIp,
      detail: sameIp
        ? `Found a matching IP with another evidence record: ${targetEvidence.ip_address}`
        : 'No matching IP address was found among the other evidence items.',
    },
    {
      question: 'Does it share the same device with other case evidence?',
      result: sameDevice,
      detail: sameDevice
        ? `Device match found: ${targetEvidence.device}`
        : 'No matching device was found in the same case.',
    },
    {
      question: 'Are other evidence items within the same 15-minute window?',
      result: closeTimestamp,
      detail: closeTimestamp
        ? 'Timestamp analysis found another item close enough to be in the same activity window.'
        : 'No nearby timestamps were found within the 15-minute window.',
    },
    {
      question: 'Do the tags, titles, or descriptions suggest suspicious context?',
      result: keywordMatch,
      detail: keywordMatch
        ? 'Keywords or tags point toward suspicious or anomalous activity.'
        : 'No clear suspicious keywords or tags were detected in the target or supporting items.',
    },
    {
      question: 'Is there supporting evidence ranked above the search threshold?',
      result: supportingEvidenceExists,
      detail: supportingEvidenceExists
        ? `Heuristic search found ${related.length} strongly related evidence item(s) above the threshold.`
        : 'No strongly related evidence was found above the relevance threshold.',
    },
  ];

  for (const check of checks) {
    steps.push(check);
  }

  const passedCount = steps.filter((step) => step.result).length;

  let conclusion: BackwardConclusion;
  if (passedCount === 5) conclusion = 'Strong Support';
  else if (passedCount === 4) conclusion = 'Moderate Support';
  else if (passedCount >= 1 && passedCount <= 3) conclusion = 'Weak Support';
  else conclusion = 'Insufficient Evidence';

  return {
    hypothesis,
    steps,
    conclusion,
  };
}
