import type { Evidence } from '../types/evidence';

// A small rule shape so this helper works with the fired-rule data shown in the UI.
export interface RuleFindingLike {
  ruleId: string;
  description: string;
  resultFact?: {
    subject?: string;
    predicate?: string;
    value?: unknown;
  };
}

// Looks up an evidence title by id. Returns the title in curly quotes, or a safe fallback.
function quotedEvidenceTitle(evidenceList: Evidence[], evidenceId: string): string {
  const match = evidenceList.find((item) => item.id === evidenceId);
  return match ? `“${match.title}”` : 'an evidence item';
}

// Finds a title for a Log File/IP Address item that shares an IP with another such record.
function findSuspiciousIpTitle(evidenceList: Evidence[]): string | null {
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
        return a.title;
      }
    }
  }

  return null;
}

// Turns a forward-chaining rule result into one plain sentence for investigators.
// Never shows raw ids, "pair:", "true", or predicate names.
export function describeRuleFinding(rule: RuleFindingLike, evidenceList: Evidence[]): string {
  if (rule.ruleId === 'rule-suspicious-ip-match') {
    const title = findSuspiciousIpTitle(evidenceList);
    const display = title ? `“${title}”` : 'an evidence item';
    return `${display} uses an IP address that also appears in another log or IP record in this case.`;
  }

  if (rule.ruleId === 'rule-related-event-window') {
    const subject = rule.resultFact?.subject || '';
    const parts = subject.startsWith('pair:') ? subject.slice('pair:'.length).split(':') : [];
    const [idA, idB] = parts;
    const titleA = idA ? quotedEvidenceTitle(evidenceList, idA) : 'an evidence item';
    const titleB = idB ? quotedEvidenceTitle(evidenceList, idB) : 'an evidence item';
    return `${titleA} and ${titleB} come from the same device and were recorded within 15 minutes of each other.`;
  }

  if (rule.ruleId === 'rule-strong-case-cluster') {
    return 'Three or more evidence items in this case are closely linked.';
  }

  // Unknown rules keep their original description so we do not hide information.
  return rule.description;
}

// Maps backward-chaining question/detail text to plain language for display.
// If a string is not recognised, it is returned unchanged.
export function plainCheckText(text: string): string {
  const exact: Record<string, string> = {
    'Are other evidence items within the same 15-minute window?':
      'Were other evidence items recorded within 15 minutes of this one?',
    'Do the tags, titles, or descriptions suggest suspicious context?':
      'Do the tags, titles or descriptions point to activity that needs a closer look?',
    'Is there supporting evidence ranked above the search threshold?':
      'Are other items closely linked to this one, based on the checks above?',
    'No matching IP address was found among the other evidence items.':
      'No other record uses the same IP address.',
    'No matching device was found in the same case.':
      'No other record in this case comes from the same device.',
    'Timestamp analysis found another item close enough to be in the same activity window.':
      'Another item was recorded within 15 minutes of this one.',
    'No nearby timestamps were found within the 15-minute window.':
      'No other item was recorded within 15 minutes of this one.',
    'Keywords or tags point toward suspicious or anomalous activity.':
      'Some tags or words in this record point to activity that needs a closer look.',
    'No clear suspicious keywords or tags were detected in the target or supporting items.':
      'No tags or words pointing to activity that needs a closer look were found.',
    'No strongly related evidence was found above the relevance threshold.':
      'No other evidence items appeared closely linked.',
  };

  if (Object.prototype.hasOwnProperty.call(exact, text)) {
    return exact[text];
  }

  const ipMatch = text.match(/^Found a matching IP with another evidence record: (.+)$/);
  if (ipMatch) {
    return `Another record uses the same IP address: ${ipMatch[1]}`;
  }

  const deviceMatch = text.match(/^Device match found: (.+)$/);
  if (deviceMatch) {
    return `Another record comes from the same device: ${deviceMatch[1]}`;
  }

  const relatedMatch = text.match(/^Heuristic search found (\d+) strongly related evidence item\(s\) above the threshold\.$/);
  if (relatedMatch) {
    return `${relatedMatch[1]} other evidence item(s) appear closely linked, based on shared details.`;
  }

  return text;
}

// Maps pair-reason text from the heuristic matcher to plain language for display.
// Anything not recognised is returned unchanged.
export function plainReason(text: string): string {
  const sameIp = text.match(/^Same IP address \((.+)\)$/);
  if (sameIp) return `Same IP address: ${sameIp[1]}`;

  const sameDevice = text.match(/^Same device \((.+)\)$/);
  if (sameDevice) return `Same device: ${sameDevice[1]}`;

  const sameSource = text.match(/^Same source \((.+)\)$/);
  if (sameSource) return `Same source: ${sameSource[1]}`;

  const timestamp = text.match(/^Timestamp within (\d+) minutes \((.+) mins apart\)$/);
  if (timestamp) return `Recorded about ${timestamp[2]} minutes apart (within ${timestamp[1]} minutes)`;

  const tags = text.match(/^Matching keywords\/tags: (.+)$/);
  if (tags) return `Shared tags: ${tags[1]}`;

  const sameType = text.match(/^Same evidence type \((.+)\)$/);
  if (sameType) return `Same kind of evidence: ${sameType[1]}`;

  const relatedTypes = text.match(/^Related evidence types \((.+) & (.+)\)$/);
  if (relatedTypes) return `Kinds of evidence often reviewed together: ${relatedTypes[1]} and ${relatedTypes[2]}`;

  return text;
}

// Describes a forward-chaining rule in plain text for the "How was this found?" details.
// Never includes raw ids, "pair:", "true", predicate names, or the word "suspicious".
export function describeRuleDetails(
  rule: RuleFindingLike,
  evidenceList: Evidence[]
): { checkName: string; whatItDoes: string; result: string } {
  if (rule.ruleId === 'rule-suspicious-ip-match') {
    return {
      checkName: 'Repeated IP address',
      whatItDoes: 'Looks for log or IP records that share the same IP address as another log or IP record in the case.',
      result: 'Matched.',
    };
  }

  if (rule.ruleId === 'rule-related-event-window') {
    const subject = rule.resultFact?.subject || '';
    const parts = subject.startsWith('pair:') ? subject.slice('pair:'.length).split(':') : [];
    const [idA, idB] = parts;
    const titleA = idA ? quotedEvidenceTitle(evidenceList, idA) : 'an evidence item';
    const titleB = idB ? quotedEvidenceTitle(evidenceList, idB) : 'an evidence item';
    return {
      checkName: 'Same device, close in time',
      whatItDoes: 'Looks for two evidence items from the same device that were recorded within 15 minutes of each other.',
      result: `Matched for ${titleA} and ${titleB}.`,
    };
  }

  if (rule.ruleId === 'rule-strong-case-cluster') {
    return {
      checkName: 'Closely linked group',
      whatItDoes: 'Looks for three or more evidence items that are closely linked to each other.',
      result: 'Matched.',
    };
  }

  return {
    checkName: rule.description,
    whatItDoes: 'This check was produced by the analysis program.',
    result: 'Matched.',
  };
}