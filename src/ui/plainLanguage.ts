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

// Maps a suggested next-step sentence to plain language for display.
// Variable parts (evidence names/pairs/findings) are kept; unknown strings are unchanged.
export function plainNextStep(text: string): string {
  const verifyAccess = text.match(/^Verify the access path and login context for (.+) before closing the case\.$/);
  if (verifyAccess) return `Check how ${verifyAccess[1]} was accessed and who signed in before closing the case.`;

  if (text === 'Review the timeline across the strongly connected evidence cluster to confirm whether the events are part of one sequence.') {
    return 'Review the times of the closely linked evidence items to see whether the events happened as one sequence.';
  }

  const verifyTimeline = text.match(/^Verify the timeline sequence for (.+) to resolve the mismatch in timing or missing shared attributes\.$/);
  if (verifyTimeline) return `Check the order of events for ${verifyTimeline[1]} to understand the time difference or missing shared details.`;

  const compareRelated = text.match(/^Compare related evidence around "(.+)" to expand the chain of support\.$/);
  if (compareRelated) {
    const ruleNames: Record<string, string> = {
      'Login event matches suspicious IP address': 'repeated IP address',
      'Evidence items share the same 15-minute window and same device': 'same device, close in time',
      'Three or more evidence records form a strong cluster': 'closely linked group',
    };
    const shortName = Object.prototype.hasOwnProperty.call(ruleNames, compareRelated[1]) ? ruleNames[compareRelated[1]] : compareRelated[1];
    return `Compare related evidence around this finding: ${shortName} to look for more supporting records.`;
  }

  const addCorroborating = text.match(/^Add another corroborating record for (.+) to strengthen the case narrative\.$/);
  if (addCorroborating) return `Add another record that supports or explains ${addCorroborating[1]}.`;

  if (text === 'Collect additional records with the same device, IP, or time window to improve confidence in the inference.') {
    return 'Collect more records from the same device, the same IP address, or around the same time to better understand what happened.';
  }

  if (text === 'Add the first evidence records to create a stronger case timeline.') {
    return 'Add the first evidence items to build a clearer timeline.';
  }

  if (text === 'Check whether the case already has a suspicious IP, device, or shared timestamp pattern.') {
    return 'Check whether the case already has the same IP address, the same device, or events recorded at similar times.';
  }

  if (text === 'Document the basic case narrative before deeper relationship analysis.') {
    return 'Write down the basic facts of the case before looking for links between evidence.';
  }

  return text;
}

// Maps the priority explanation summary to plain language for display.
// Priority names and numbers are kept; unknown strings are unchanged.
export function plainSummary(text: string): string {
  const replaceFragments = (rest: string): string =>
    rest
      .replace(/(\d+) related evidence records were identified\./g, (_m, n: string) =>
        `${n} evidence ${n === '1' ? 'item' : 'items'} may be linked.`)
      .replace(/the evidence set did not show enough strong relationships for escalation\./g, 'there were not enough clear links between evidence items to suggest a higher priority.');

  const changed = text.match(/^Case priority changed from (.+) to (.+) because (.+)$/);
  if (changed) {
    return `Suggested priority: ${changed[2]} (currently ${changed[1]}) because ${replaceFragments(changed[3])}`;
  }

  const remained = text.match(/^Case priority remained (.+) because (.+)$/);
  if (remained) {
    return `Suggested priority stays ${remained[1]} because ${replaceFragments(remained[2])}`;
  }

  return text;
}

// Formats a stored priority code (e.g. HIGH) as a readable label (e.g. High).
function formatPriorityLabel(code: string): string {
  const upper = code.toUpperCase();
  if (upper === 'LOW' || upper === 'MEDIUM' || upper === 'HIGH' || upper === 'CRITICAL') {
    return `${upper[0]}${upper.slice(1).toLowerCase()}`;
  }
  return code;
}

// Maps a stored timeline event name to a plain title for display only.
// Original stored event names must still be used for comparisons in code.
export function plainTimelineTitle(event: string): string {
  const map: Record<string, string> = {
    'Case Created': 'Case opened',
    'Evidence Added': 'Evidence added',
    'Status Updated': 'Case status changed',
    'AI Reprioritization': 'Priority changed',
    'AI Detected Related Evidence': 'Possible links found',
    'AI Analysis': 'Automated check',
  };
  return Object.prototype.hasOwnProperty.call(map, event) ? map[event] : event;
}

// Maps a stored timeline event description to plain language for display only.
// Titles, case numbers, investigator names and other stored user text are kept unchanged.
// If the event/description does not match a known pattern, it is returned unchanged.
export function plainTimelineDescription(event: string, description: string): string {
  if (event === 'Case Created') {
    const endMarker = ') was initiated by ';
    const startMarker = 'Case ';
    const k = description.lastIndexOf(endMarker);
    if (description.startsWith(startMarker) && k !== -1 && description.endsWith('.')) {
      const left = description.slice(startMarker.length, k); // "{case_number} ({title}"
      const investigator = description.slice(k + endMarker.length, -1);
      const p = left.indexOf(' (');
      if (p !== -1) {
        const caseNumber = left.slice(0, p);
        const title = left.slice(p + 2);
        return `Case ${caseNumber} (${title}) was opened by ${investigator}.`;
      }
    }
    return description;
  }

  if (event === 'Evidence Added') {
    const m = description.match(/^Evidence Added: ([\s\S]+) \(([^()]+)\)$/);
    if (m) {
      return `Added evidence: ${m[1]} (${m[2]}).`;
    }
    return description;
  }

  if (event === 'Status Updated') {
    const m = description.match(/^Case status changed to (.+)\.$/);
    if (m) {
      const code = m[1];
      // Underscores become spaces, lower-cased, with the first letter capitalised.
      const pretty = code.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
      return `Case status changed to ${pretty}.`;
    }
    return description;
  }

  if (event === 'AI Reprioritization') {
    const m = description.match(/^AI Reprioritization: (\S+) to (\S+) - ([\s\S]+)$/);
    if (m) {
      const a = formatPriorityLabel(m[1]);
      const b = formatPriorityLabel(m[2]);
      const reason = m[3];
      // STEP 0 finding: updateCasePriority is only called after the investigator clicks
      // "Use suggested priority" in CaseDetails.tsx (handlePriorityApply), so this event
      // means the investigator accepted the suggestion.
      const reasonText = /^AI recommendation updated the case priority to \S+\.$/.test(reason)
        ? 'The analysis suggested this priority.'
        : plainSummary(reason);
      return `Priority changed from ${a} to ${b} after the investigator accepted the suggestion. Reason: ${reasonText}`;
    }
    return description;
  }

  if (event === 'AI Detected Related Evidence') {
    const m = description.match(/^AI Detected Related Evidence: New evidence '([\s\S]+)' relates to (\d+) existing (item|items) \(Score: (\d+)%\)\.$/);
    if (m) {
      return `Possible links found: new evidence '${m[1]}' may be linked to ${m[2]} existing ${m[3]} (link score ${m[4]} out of 100). This is a guide, not proof.`;
    }
    return description;
  }

  if (event === 'AI Analysis') {
    const m = description.match(/^AI Analysis: No strong relationships found for new evidence '([\s\S]+)'\.$/);
    if (m) {
      return `Automated check: no strong links were found for new evidence '${m[1]}' at this time.`;
    }
    return description;
  }

  return description;
}

// Builds a short dashboard notice message from a stored timeline event (display only).
// For reprioritization it shows the priority change; other events get a general review message.
export function plainDashboardNotice(eventName: string, description: string): string {
  if (eventName === 'AI Reprioritization') {
    const m = description.match(/(?:from\s+)?(LOW|MEDIUM|HIGH|CRITICAL)\s+to\s+(LOW|MEDIUM|HIGH|CRITICAL)/i);
    if (m) {
      return `Priority changed from ${formatPriorityLabel(m[1])} to ${formatPriorityLabel(m[2])}.`;
    }
  }
  return 'New evidence may be linked to other items in this case. Review the links in the case.';
}

// Maps known timeline loading errors to plain language for display; others unchanged.
export function plainTimelineError(text: string): string {
  if (text === 'Unable to load the case timeline.') {
    return 'Could not load the timeline. Try again.';
  }
  return text;
}