import { Case, Priority } from '../types/case';
import { Evidence } from '../types/evidence';
import { scoreAllEvidenceForCase } from './heuristicMatcher';
import { runForwardChaining, ForwardChainingResult } from './forwardChainer';
import { investigateHypothesis } from './backwardChainer';
import { validateAllRelationshipsForCase } from './constraintSolver';
import { buildKnowledgeBaseFromCase } from './knowledgeBase';

export interface RelevanceBreakdown {
  totalPairs: number;
  averageScore: number;
  maxScore: number;
  strongPairs: number;
  relatedEventFacts: number;
  suspiciousActivity: boolean;
  strongCluster: boolean;
}

export interface ConstraintSummary {
  totalPairs: number;
  validPairs: number;
  invalidPairs: number;
  failingPairs: string[];
}

export interface AdaptiveAnalysisResult {
  newPriority: Priority;
  previousPriority: Priority;
  priorityChanged: boolean;
  relevanceBreakdown: RelevanceBreakdown;
  firedRules: ForwardChainingResult['firedRules'];
  constraintSummary: ConstraintSummary;
  explanationSummary: string;
  knowledgeBaseSnapshot?: ReturnType<ReturnType<typeof buildKnowledgeBaseFromCase>['exportGraph']>;
  backwardCheck?: ReturnType<typeof investigateHypothesis>;
}

function toPriorityLabel(priority?: Priority | string | null): Priority {
  if (priority === 'LOW' || priority === 'MEDIUM' || priority === 'HIGH' || priority === 'CRITICAL') {
    return priority;
  }
  return 'LOW';
}

export function calculateCasePriority(
  evidenceList: Evidence[],
  forwardChainingResult: ForwardChainingResult
): Priority {
  const pairScores = scoreAllEvidenceForCase(evidenceList);
  const derivedFacts = forwardChainingResult.derivedFacts;

  const averageScore = pairScores.length > 0
    ? pairScores.reduce((sum, pair) => sum + pair.score, 0) / pairScores.length
    : 0;
  const maxScore = pairScores.length > 0
    ? Math.max(...pairScores.map((pair) => pair.score))
    : 0;
  const strongPairs = pairScores.filter((pair) => pair.score >= 60).length;

  const hasSuspiciousActivity = derivedFacts.some(
    (fact) => fact.predicate === 'suspicious_activity' && fact.value === true
  );
  const hasStrongCluster = derivedFacts.some(
    (fact) => fact.predicate === 'strong_case_cluster' && fact.value === true
  );
  const hasRelatedEvent = derivedFacts.some(
    (fact) => fact.predicate === 'related_event' && fact.value === true
  );

  if (hasSuspiciousActivity && hasStrongCluster) {
    return 'CRITICAL';
  }

  if (evidenceList.length === 0) {
    return 'LOW';
  }

  if (evidenceList.length <= 1 && pairScores.length === 0 && !hasRelatedEvent && !hasSuspiciousActivity) {
    return 'LOW';
  }

  if (hasStrongCluster || (maxScore >= 75 && averageScore >= 55) || (strongPairs > 0 && hasRelatedEvent)) {
    return 'HIGH';
  }

  if (pairScores.length > 0 || hasRelatedEvent || hasSuspiciousActivity || strongPairs > 0) {
    if (averageScore >= 35 || strongPairs > 0 || maxScore >= 50) {
      return 'MEDIUM';
    }
  }

  return 'LOW';
}

export function analyzeCase(
  caseData: Case,
  evidenceList: Evidence[],
  previousPriority?: Priority
): AdaptiveAnalysisResult {
  const effectivePreviousPriority = toPriorityLabel(previousPriority ?? caseData.priority ?? 'LOW');

  const pairScores = scoreAllEvidenceForCase(evidenceList, { timeWindowMinutes: 15 });
  const forwardChainingResult = runForwardChaining(evidenceList, caseData.id);

  const evidenceScoresById = new Map<string, number>();
  for (const pair of pairScores) {
    evidenceScoresById.set(pair.evidenceAId, (evidenceScoresById.get(pair.evidenceAId) ?? 0) + pair.score);
    evidenceScoresById.set(pair.evidenceBId, (evidenceScoresById.get(pair.evidenceBId) ?? 0) + pair.score);
  }

  const mostConnectedEvidence = evidenceList.length > 0
    ? [...evidenceList].sort((a, b) => (evidenceScoresById.get(b.id) ?? 0) - (evidenceScoresById.get(a.id) ?? 0))[0]
    : null;

  const backwardCheck = mostConnectedEvidence
    ? investigateHypothesis(
        'Is this evidence related to suspicious activity?',
        mostConnectedEvidence,
        evidenceList
      )
    : null;

  const constraintResults = validateAllRelationshipsForCase(evidenceList, caseData.id, {
    maxTimestampDiffHours: 24,
  });

  const validPairs = constraintResults.filter((pair) => pair.valid).length;
  const invalidPairs = constraintResults.length - validPairs;
  const failingPairs = constraintResults
    .filter((pair) => !pair.valid)
    .map((pair) => `${pair.evidenceATitle} and ${pair.evidenceBTitle}`);

  const relevanceBreakdown: RelevanceBreakdown = {
    totalPairs: pairScores.length,
    averageScore: pairScores.length > 0
      ? Number((pairScores.reduce((sum, pair) => sum + pair.score, 0) / pairScores.length).toFixed(1))
      : 0,
    maxScore: pairScores.length > 0 ? Math.max(...pairScores.map((pair) => pair.score)) : 0,
    strongPairs: pairScores.filter((pair) => pair.score >= 60).length,
    relatedEventFacts: forwardChainingResult.derivedFacts.filter(
      (fact) => fact.predicate === 'related_event' && fact.value === true
    ).length,
    suspiciousActivity: forwardChainingResult.derivedFacts.some(
      (fact) => fact.predicate === 'suspicious_activity' && fact.value === true
    ),
    strongCluster: forwardChainingResult.derivedFacts.some(
      (fact) => fact.predicate === 'strong_case_cluster' && fact.value === true
    ),
  };

  const newPriority = calculateCasePriority(evidenceList, forwardChainingResult);
  const priorityChanged = effectivePreviousPriority !== newPriority;

  const connectedRecordCount = pairScores.length > 0
    ? new Set(pairScores.filter((pair) => pair.score >= 30).flatMap((pair) => [pair.evidenceAId, pair.evidenceBId])).size
    : 0;

  const relatedSummary = connectedRecordCount > 0
    ? `${connectedRecordCount} related evidence records were identified.`
    : 'the evidence set did not show enough strong relationships for escalation.';

  const explanationSummary = priorityChanged
    ? `Case priority changed from ${effectivePreviousPriority} to ${newPriority} because ${relatedSummary}`
    : `Case priority remained ${newPriority} because ${relatedSummary}`;

  return {
    newPriority,
    previousPriority: effectivePreviousPriority,
    priorityChanged,
    relevanceBreakdown,
    firedRules: forwardChainingResult.firedRules,
    constraintSummary: {
      totalPairs: constraintResults.length,
      validPairs,
      invalidPairs,
      failingPairs,
    },
    explanationSummary,
    knowledgeBaseSnapshot: buildKnowledgeBaseFromCase(caseData, evidenceList).exportGraph(),
    backwardCheck: backwardCheck ?? undefined,
  };
}
