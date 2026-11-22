// Enums and TypeScript types for Forensic Evidence

export type EvidenceType =
  | 'Screenshot'
  | 'Email'
  | 'Log File'
  | 'IP Address'
  | 'Device Information'
  | 'File'
  | 'URL'
  | 'Message'
  | 'Timestamp/Event'
  | 'Other';

export interface Evidence {
  id: string;
  case_id: string;
  evidence_type: EvidenceType;
  title: string;
  description: string;
  source: string;
  timestamp: string;
  ip_address?: string;
  device?: string;
  related_event?: string;
  tags: string[];
  status: string;
  file_url?: string;
  created_at: string;
}

export interface EvidenceRelationship {
  id: string;
  case_id: string;
  evidence_a_id: string;
  evidence_b_id: string;
  relevance_score: number;
  reasons: string[]; // Stored as jsonb in Postgres
  relationship_type: string;
  created_at: string;
}
