import type { Case } from '../types/case';
import type { Evidence } from '../types/evidence';

export interface MlFeatures {
  evidence_type: Evidence['evidence_type'];
  case_type: Case['case_type'];
  source: string;
  description: string;
  tags: string;
  hour_of_day: number;
  hours_from_incident: number;
  ip_is_suspicious: number;
  shared_ip_count: number;
  shared_device_count: number;
  has_file_attachment: number;
  tag_count: number;
}

export interface MlFeatureResult {
  features: MlFeatures;
  warnings: string[];
}

const CANONICAL_SOURCES = [
  'Auth Server',
  'Email Gateway',
  'Endpoint',
  'Network Sensor',
  'Cloud Storage',
  'Threat Intelligence',
  'User Report',
  'System Scheduler',
] as const;

/**
 * Build the 12 synthetic-training-compatible values for one evidence item.
 * This function has no network or ML-service dependency.
 */
export function buildMlFeatures(
  evidence: Evidence,
  caseData: Case,
  allCaseEvidence: Evidence[]
): MlFeatureResult {
  const warnings: string[] = [];

  // Source is free text in the app, while the dataset used a small set of canonical names.
  const trimmedSource = evidence.source?.trim() ?? '';
  const canonicalSource = CANONICAL_SOURCES.find(
    (source) => source.toLowerCase() === trimmedSource.toLowerCase()
  );
  const source = canonicalSource ?? trimmedSource;

  // Keep the evidence description itself; the title is intentionally not a model feature.
  const description = (evidence.description ?? '').slice(0, 2000);

  // Normalize tags as the synthetic dataset did: lowercase, unique, comma-separated.
  const normalizedTags = Array.from(
    new Set(
      (evidence.tags ?? [])
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0)
    )
  );

  // The cap of 4 matches the synthetic dataset, which built 1-4 unique tags per row.
  const tag_count = Math.min(normalizedTags.length, 4);
  const tags = normalizedTags.join(', ').slice(0, 500);

  // Invalid evidence timestamps use noon to keep the API field within 0-23.
  const evidenceTimestamp = new Date(evidence.timestamp);
  let hour_of_day = evidenceTimestamp.getHours();
  if (Number.isNaN(evidenceTimestamp.getTime())) {
    hour_of_day = 12;
    warnings.push('Invalid evidence timestamp; hour_of_day was set to 12.');
  }

  // Date.reported is the best existing case reference; the synthetic cap was 168 hours.
  const reportedTimestamp = new Date(caseData.date_reported).getTime();
  let hours_from_incident = 168;
  if (Number.isNaN(evidenceTimestamp.getTime()) || Number.isNaN(reportedTimestamp)) {
    warnings.push(
      'Invalid evidence timestamp or case date_reported; hours_from_incident was set to 168.'
    );
  } else {
    hours_from_incident = Math.min(
      Math.abs(evidenceTimestamp.getTime() - reportedTimestamp) / (1000 * 60 * 60),
      168
    );
  }

  const evidenceIp = evidence.ip_address?.trim().toLowerCase() ?? '';
  let shared_ip_count = 0;
  if (evidenceIp) {
    const count = allCaseEvidence.filter((other) => {
      if (other.id === evidence.id) return false;
      return (other.ip_address?.trim().toLowerCase() ?? '') === evidenceIp;
    }).length;
    shared_ip_count = Math.min(count, 5);
  }

  const evidenceDevice = evidence.device?.trim().toLowerCase() ?? '';
  let shared_device_count = 0;
  if (evidenceDevice) {
    const count = allCaseEvidence.filter((other) => {
      if (other.id === evidence.id) return false;
      return (other.device?.trim().toLowerCase() ?? '') === evidenceDevice;
    }).length;
    shared_device_count = Math.min(count, 4);
  }

  /*
   * forwardChainer.ts contains findSuspiciousIpPairs, but it is not exported.
   * This reimplements that original rule: only Log File and IP Address evidence
   * items that share the same non-empty IP are considered suspicious.
   */
  let ip_is_suspicious = 0;
  if (
    evidenceIp &&
    (evidence.evidence_type === 'Log File' ||
      evidence.evidence_type === 'IP Address')
  ) {
    const matchingEvidence = allCaseEvidence.some((other) => {
      if (other.id === evidence.id) return false;
      if (
        other.evidence_type !== 'Log File' &&
        other.evidence_type !== 'IP Address'
      ) {
        return false;
      }
      return (other.ip_address?.trim().toLowerCase() ?? '') === evidenceIp;
    });
    ip_is_suspicious = matchingEvidence ? 1 : 0;
  }

  // The synthetic attachment range is 0/1; a real URL, even if local, is an attachment.
  const has_file_attachment =
    typeof evidence.file_url === 'string' && evidence.file_url.trim().length > 0
      ? 1
      : 0;

  return {
    features: {
      evidence_type: evidence.evidence_type,
      case_type: caseData.case_type,
      source,
      description,
      tags,
      hour_of_day,
      hours_from_incident,
      ip_is_suspicious,
      shared_ip_count,
      shared_device_count,
      has_file_attachment,
      tag_count,
    },
    warnings,
  };
}
