import { Case } from '../types/case';
import { Evidence } from '../types/evidence';
import { analyzeCase } from './adaptiveAnalyzer';

/**
 * ============================================================================
 * CLASSICAL AI: INTELLIGENT AGENT ORCHESTRATOR
 * ============================================================================
 * Explanation for Viva / Evaluation:
 * The agent is the single entry point the UI will call — it hides the complexity
 * of the 8 AI modules behind one function.
 *
 * This module coordinates the forensic pipeline without using machine learning:
 * it prepares the case data, invokes the reasoning modules, and returns a concise
 * human-readable result for the interface.
 */

function buildSuggestedNextSteps(
  analysis: ReturnType<typeof analyzeCase>,
  newEvidence: Evidence | null,
  allEvidenceInCase: Evidence[]
): string[] {
  const steps: string[] = [];

  const suspicious = analysis.relevanceBreakdown.suspiciousActivity;
  const cluster = analysis.relevanceBreakdown.strongCluster;
  const invalidPairs = analysis.constraintSummary.failingPairs;
  const firedRules = analysis.firedRules.map((rule) => rule.description);

  if (suspicious) {
    const target = newEvidence?.title ?? 'the suspicious evidence item';
    steps.push(`Verify the access path and login context for ${target} before closing the case.`);
  }

  if (cluster) {
    steps.push('Review the timeline across the strongly connected evidence cluster to confirm whether the events are part of one sequence.');
  }

  if (invalidPairs.length > 0) {
    const firstPair = invalidPairs[0];
    steps.push(`Verify the timeline sequence for ${firstPair} to resolve the mismatch in timing or missing shared attributes.`);
  }

  if (steps.length < 2 && firedRules.length > 0) {
    steps.push(`Compare related evidence around "${firedRules[0]}" to expand the chain of support.`);
  }

  if (steps.length < 2 && allEvidenceInCase.length > 0) {
    const missing = allEvidenceInCase[0]?.title ?? 'the current evidence set';
    steps.push(`Add another corroborating record for ${missing} to strengthen the case narrative.`);
  }

  if (steps.length < 2) {
    steps.push('Collect additional records with the same device, IP, or time window to improve confidence in the inference.');
  }

  return steps.slice(0, 4);
}

export function onNewEvidenceAdded(
  caseId: string,
  newEvidence: Evidence | null,
  allEvidenceInCase: Evidence[],
  currentCase: Case | null
): ReturnType<typeof analyzeCase> & { suggestedNextSteps: string[] } {
  const baseCase: Case = currentCase ?? {
    id: caseId,
    case_number: 'NEW',
    title: 'New Case',
    case_type: 'Other',
    description: 'New case created from incoming evidence.',
    date_reported: new Date().toISOString(),
    priority: 'LOW',
    status: 'OPEN',
    investigator: 'AI Agent',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const analysis = analyzeCase(baseCase, allEvidenceInCase, baseCase.priority ?? 'LOW');
  return {
    ...analysis,
    suggestedNextSteps: buildSuggestedNextSteps(analysis, newEvidence, allEvidenceInCase),
  };
}

export function onCaseCreated(caseData: Case): ReturnType<typeof analyzeCase> & { suggestedNextSteps: string[] } {
  const analysis = analyzeCase(caseData, [], caseData.priority ?? 'LOW');

  return {
    ...analysis,
    suggestedNextSteps: [
      'Add the first evidence records to create a stronger case timeline.',
      'Check whether the case already has a suspicious IP, device, or shared timestamp pattern.',
      'Document the basic case narrative before deeper relationship analysis.',
    ],
  };
}
