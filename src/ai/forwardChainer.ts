import { Evidence } from '../types/evidence';
import { scoreEvidencePair } from './heuristicMatcher';

/**
 * ==========================================================================
 * CLASSICAL AI: FORWARD CHAINING
 * ==========================================================================
 * Explanation for Viva / Evaluation:
 * Forward chaining is data-driven: start from known facts, apply rules,
 * derive new facts, and repeat until no new knowledge can be added.
 *
 * This is a classic expert-system pattern used in forensic reasoning, but it
 * remains transparent and easy to explain because every conclusion can be traced
 * back to a rule and evidence inputs.
 */

export interface Fact {
  subject: string;
  predicate: string;
  value: any;
}

export interface Rule {
  id: string;
  description: string;
  condition: (facts: Fact[], evidence: Evidence[]) => boolean;
  conclusion: (facts: Fact[], evidence: Evidence[]) => Fact;
}

export interface FiredRuleLog {
  ruleId: string;
  description: string;
  resultFact: Fact;
}

export interface ForwardChainingResult {
  derivedFacts: Fact[];
  firedRules: FiredRuleLog[];
}

const TIME_WINDOW_MINUTES = 15;
const SEARCH_THRESHOLD = 30;

function makeFactKey(fact: Fact): string {
  return `${fact.subject}::${fact.predicate}::${String(fact.value)}`;
}

function findSuspiciousIpPairs(evidenceList: Evidence[]) {
  const matches: { a: Evidence; b: Evidence; ip: string }[] = [];

  for (let i = 0; i < evidenceList.length; i++) {
    const a = evidenceList[i];
    if (a.evidence_type !== 'Log File' && a.evidence_type !== 'IP Address') continue;

    for (let j = 0; j < evidenceList.length; j++) {
      if (i === j) continue;

      const b = evidenceList[j];
      if (b.evidence_type !== 'Log File' && b.evidence_type !== 'IP Address') continue;

      const ipA = a.ip_address?.trim().toLowerCase();
      const ipB = b.ip_address?.trim().toLowerCase();

      if (ipA && ipB && ipA === ipB) {
        matches.push({ a, b, ip: ipA });
      }
    }
  }

  return matches;
}

function findRelatedEventPairs(evidenceList: Evidence[]) {
  const matches: { a: Evidence; b: Evidence }[] = [];

  for (let i = 0; i < evidenceList.length; i++) {
    const a = evidenceList[i];
    const deviceA = a.device?.trim().toLowerCase();

    if (!deviceA) continue;

    for (let j = i + 1; j < evidenceList.length; j++) {
      const b = evidenceList[j];
      const deviceB = b.device?.trim().toLowerCase();
      if (!deviceB || deviceA !== deviceB) continue;

      if (!a.timestamp || !b.timestamp) continue;

      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      if (Number.isNaN(timeA) || Number.isNaN(timeB)) continue;

      const diffMinutes = Math.abs(timeA - timeB) / (1000 * 60);
      if (diffMinutes <= TIME_WINDOW_MINUTES) {
        matches.push({ a, b });
      }
    }
  }

  return matches;
}

function findStrongCaseClusters(evidenceList: Evidence[]) {
  const clusters: Evidence[][] = [];

  for (let i = 0; i < evidenceList.length; i++) {
    for (let j = i + 1; j < evidenceList.length; j++) {
      if (scoreEvidencePair(evidenceList[i], evidenceList[j]).score < SEARCH_THRESHOLD) {
        continue;
      }
    }
  }

  if (evidenceList.length < 3) return clusters;

  for (let i = 0; i < evidenceList.length; i++) {
    for (let j = i + 1; j < evidenceList.length; j++) {
      for (let k = j + 1; k < evidenceList.length; k++) {
        const a = evidenceList[i];
        const b = evidenceList[j];
        const c = evidenceList[k];
        const eab = scoreEvidencePair(a, b).score;
        const eac = scoreEvidencePair(a, c).score;
        const ebc = scoreEvidencePair(b, c).score;

        if (eab >= SEARCH_THRESHOLD && eac >= SEARCH_THRESHOLD && ebc >= SEARCH_THRESHOLD) {
          clusters.push([a, b, c]);
        }
      }
    }
  }

  return clusters;
}

function buildBaseFacts(evidenceList: Evidence[], caseId: string): Fact[] {
  const facts: Fact[] = [];

  for (const item of evidenceList) {
    facts.push({ subject: item.id, predicate: 'title', value: item.title });
    facts.push({ subject: item.id, predicate: 'evidence_type', value: item.evidence_type });
    facts.push({ subject: item.id, predicate: 'source', value: item.source });
    facts.push({ subject: item.id, predicate: 'timestamp', value: item.timestamp });

    if (item.ip_address) {
      facts.push({ subject: item.id, predicate: 'ip_address', value: item.ip_address });
    }

    if (item.device) {
      facts.push({ subject: item.id, predicate: 'device', value: item.device });
    }

    if (item.tags && item.tags.length > 0) {
      for (const tag of item.tags) {
        facts.push({ subject: item.id, predicate: 'tag', value: tag });
      }
    }
  }

  facts.push({ subject: caseId, predicate: 'case_id', value: caseId });
  return facts;
}

export const forwardRules: Rule[] = [
  {
    id: 'rule-suspicious-ip-match',
    description: 'Login event matches suspicious IP address',
    condition: (facts, evidence) => {
      const suspiciousPairs = findSuspiciousIpPairs(evidence);
      const caseIdFacts = facts.filter((fact) => fact.predicate === 'case_id');
      return suspiciousPairs.length > 0 && caseIdFacts.length > 0;
    },
    conclusion: (facts, evidence) => {
      const caseId = facts.find((fact) => fact.predicate === 'case_id')?.subject ?? 'case:unknown';
      const suspiciousPairs = findSuspiciousIpPairs(evidence);
      const primaryPair = suspiciousPairs[0];
      if (!primaryPair) {
        return { subject: caseId, predicate: 'suspicious_activity', value: true };
      }

      return {
        subject: caseId,
        predicate: 'suspicious_activity',
        value: true,
        // kept for debugging: pair information not shown to the UI, but it helps explain the derivation
        meta: {
          evidenceA: primaryPair.a.id,
          evidenceB: primaryPair.b.id,
          ip: primaryPair.ip,
          reason: 'Login event matches suspicious IP address',
        },
      } as Fact & { meta?: Record<string, unknown> };
    },
  },
  {
    id: 'rule-related-event-window',
    description: 'Evidence items share the same 15-minute window and same device',
    condition: (_facts, evidence) => findRelatedEventPairs(evidence).length > 0,
    conclusion: (_facts, evidence) => {
      const relatedPairs = findRelatedEventPairs(evidence);
      const match = relatedPairs[0];
      if (!match) {
        return { subject: 'related_event:unknown', predicate: 'related_event', value: true };
      }

      return {
        subject: `pair:${match.a.id}:${match.b.id}`,
        predicate: 'related_event',
        value: true,
        meta: {
          evidenceA: match.a.id,
          evidenceB: match.b.id,
          device: match.a.device,
        },
      } as Fact & { meta?: Record<string, unknown> };
    },
  },
  {
    id: 'rule-strong-case-cluster',
    description: 'Three or more evidence records form a strong cluster',
    condition: (_facts, evidence) => findStrongCaseClusters(evidence).length > 0,
    conclusion: (facts, evidence) => {
      const caseId = facts.find((fact) => fact.predicate === 'case_id')?.subject ?? 'case:unknown';
      const cluster = findStrongCaseClusters(evidence)[0];
      return {
        subject: caseId,
        predicate: 'strong_case_cluster',
        value: true,
        meta: {
          clusterCount: cluster ? cluster.length : 0,
        },
      } as Fact & { meta?: Record<string, unknown> };
    },
  },
];

export function runForwardChaining(evidenceList: Evidence[], caseId: string): ForwardChainingResult {
  const baseFacts = buildBaseFacts(evidenceList, caseId);
  const allFacts: Fact[] = [...baseFacts];
  const firedRules: FiredRuleLog[] = [];
  const derivedFacts: Fact[] = [];
  const seenFactKeys = new Set(baseFacts.map((fact) => makeFactKey(fact)));

  let changed = true;

  while (changed) {
    changed = false;

    for (const rule of forwardRules) {
      const candidates = [] as Fact[];
      const candidateSet = new Set<string>();

      if (rule.id === 'rule-suspicious-ip-match') {
        const suspiciousPairs = findSuspiciousIpPairs(evidenceList);
        const caseIdFact = factsForCaseId(caseId, allFacts);
        if (suspiciousPairs.length > 0 && caseIdFact) {
          const fact = {
            subject: caseId,
            predicate: 'suspicious_activity',
            value: true,
          };
          candidates.push(fact);
        }
      } else if (rule.id === 'rule-related-event-window') {
        const matches = findRelatedEventPairs(evidenceList);
        for (const match of matches) {
          const fact = {
            subject: `pair:${match.a.id}:${match.b.id}`,
            predicate: 'related_event',
            value: true,
          };
          candidates.push(fact);
        }
      } else if (rule.id === 'rule-strong-case-cluster') {
        const clusters = findStrongCaseClusters(evidenceList);
        if (clusters.length > 0) {
          const fact = {
            subject: caseId,
            predicate: 'strong_case_cluster',
            value: true,
          };
          candidates.push(fact);
        }
      }

      for (const candidate of candidates) {
        const key = makeFactKey(candidate);
        if (seenFactKeys.has(key)) continue;

        if (!rule.condition(allFacts, evidenceList)) {
          continue;
        }

        const fact = rule.conclusion(allFacts, evidenceList);
        const factKey = makeFactKey(fact);
        if (candidateSet.has(factKey)) continue;
        candidateSet.add(factKey);

        if (!seenFactKeys.has(factKey)) {
          seenFactKeys.add(factKey);
          allFacts.push(fact);
          derivedFacts.push(fact);
          firedRules.push({
            ruleId: rule.id,
            description: rule.description,
            resultFact: fact,
          });
          changed = true;
        }
      }
    }
  }

  return { derivedFacts, firedRules };
}

function factsForCaseId(caseId: string, facts: Fact[]): Fact | undefined {
  return facts.find((fact) => fact.subject === caseId && fact.predicate === 'case_id');
}
