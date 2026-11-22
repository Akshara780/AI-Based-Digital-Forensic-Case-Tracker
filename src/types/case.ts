// Enums and TypeScript types for Case Management

export type CaseType =
  | 'Unauthorized Account Access'
  | 'Phishing'
  | 'Cyberbullying'
  | 'Data Theft'
  | 'Suspicious Activity'
  | 'Device Misuse'
  | 'Online Fraud'
  | 'Other';

export type CaseStatus =
  | 'OPEN'
  | 'UNDER_INVESTIGATION'
  | 'EVIDENCE_ADDED'
  | 'ANALYSIS'
  | 'REVIEW'
  | 'RESOLVED'
  | 'CLOSED';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type UserRole = 'INVESTIGATOR' | 'ADMIN' | 'VIEWER';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  created_at: string;
}

export interface Case {
  id: string;
  case_number: string;
  title: string;
  case_type: CaseType;
  description: string;
  date_reported: string;
  priority: Priority;
  status: CaseStatus;
  investigator: string;
  created_at: string;
  updated_at: string;
}

export interface CaseTimelineEvent {
  id: string;
  case_id: string;
  event: string;
  description: string;
  timestamp: string;
}

export interface AIAnalysisRecord {
  id: string;
  case_id: string;
  priority_score: number;
  previous_score: number;
  new_score: number;
  previous_priority: Priority;
  new_priority: Priority;
  recommendation: string;
  reasons: string[]; // Stored as jsonb in Postgres
  created_at: string;
}
