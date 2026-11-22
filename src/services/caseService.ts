import { supabase } from './supabaseClient';
import { Case, CaseStatus, CaseTimelineEvent, Priority, CaseType } from '../types/case';

export interface CreateCaseInput {
  case_number: string;
  title: string;
  case_type: CaseType;
  description: string;
  date_reported?: string;
  priority: Priority;
  status: CaseStatus;
  investigator: string;
}

export interface ListCasesFilter {
  status?: string;
  priority?: string;
  search?: string;
}

// Read every DF number and use the highest numeric suffix, not a random value.
const getNextCaseNumber = async (): Promise<string> => {
  const { data, error } = await supabase
    .from('cases')
    .select('case_number')
    .like('case_number', 'DF-%');

  if (error) throw new Error(error.message);

  const highestNumber = (data || []).reduce((highest, row) => {
    const match = /^DF-(\d+)$/i.exec(row.case_number);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);

  return `DF-${String(highestNumber + 1).padStart(3, '0')}`;
};

// 1. Create a new case and add an initial timeline record
export const createCase = async (input: CreateCaseInput): Promise<{ data: Case | null; error: string | null }> => {
  try {
    let createdCase: Case | null = null;
    let lastInsertError: string | null = null;

    // The unique case_number constraint catches concurrent submissions; re-read and retry.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const caseNumber = await getNextCaseNumber();
      const { data, error } = await supabase
        .from('cases')
        .insert({
          case_number: caseNumber,
          title: input.title,
          case_type: input.case_type,
          description: input.description,
          date_reported: input.date_reported || new Date().toISOString(),
          priority: input.priority,
          status: input.status,
          investigator: input.investigator,
        })
        .select('*')
        .single();

      if (error) {
        lastInsertError = error.message;
        if (error.code === '23505' && attempt < 2) continue;
        return { data: null, error: error.message };
      }

      createdCase = data as Case;
      break;
    }

    if (!createdCase) {
      return { data: null, error: lastInsertError || 'Failed to allocate a unique case number.' };
    }

    // Automatically record event in case_timeline
    await supabase.from('case_timeline').insert({
      case_id: createdCase.id,
      event: 'Case Created',
      description: `Case ${createdCase.case_number} (${createdCase.title}) was initiated by ${createdCase.investigator || 'Investigator'}.`,
      timestamp: new Date().toISOString(),
    });

    return { data: createdCase, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to create case' };
  }
};

// 2. List cases with optional filtering and search
export const listCases = async (filter?: ListCasesFilter): Promise<{ data: Case[]; error: string | null }> => {
  try {
    let query = supabase.from('cases').select('*').order('created_at', { ascending: false });

    if (filter?.status && filter.status !== 'ALL') {
      query = query.eq('status', filter.status);
    }

    if (filter?.priority && filter.priority !== 'ALL') {
      query = query.eq('priority', filter.priority);
    }

    if (filter?.search && filter.search.trim() !== '') {
      const s = `%${filter.search.trim()}%`;
      query = query.or(`title.ilike.${s},case_number.ilike.${s},description.ilike.${s}`);
    }

    const { data, error } = await query;

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: (data as Case[]) || [], error: null };
  } catch (err: any) {
    return { data: [], error: err.message || 'Failed to fetch cases' };
  }
};

// 3. Get single case by ID
export const getCaseById = async (id: string): Promise<{ data: Case | null; error: string | null }> => {
  try {
    const { data, error } = await supabase.from('cases').select('*').eq('id', id).single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data as Case, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to fetch case details' };
  }
};

// 4. Update case status
export const updateCaseStatus = async (
  id: string,
  newStatus: CaseStatus
): Promise<{ data: Case | null; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('cases')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    const updatedCase = data as Case;

    // Record timeline event for status update
    await supabase.from('case_timeline').insert({
      case_id: id,
      event: 'Status Updated',
      description: `Case status changed to ${newStatus}.`,
      timestamp: new Date().toISOString(),
    });

    return { data: updatedCase, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to update case status' };
  }
};

// 5. Update case priority and record an AI-informed timeline note
export const updateCasePriority = async (
  id: string,
  newPriority: Priority,
  previousPriority?: Priority,
  reason?: string
): Promise<{ data: Case | null; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('cases')
      .update({ priority: newPriority, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    const updatedCase = data as Case;
    const sourcePriority = previousPriority ?? updatedCase.priority ?? 'LOW';
    const summaryReason = reason || `AI recommendation updated the case priority to ${newPriority}.`;

    await supabase.from('case_timeline').insert({
      case_id: id,
      event: 'AI Reprioritization',
      description: `AI Reprioritization: ${sourcePriority} to ${newPriority} - ${summaryReason}`,
      timestamp: new Date().toISOString(),
    });

    return { data: updatedCase, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to update case priority' };
  }
};

// Fetch timeline entries in display order when the Timeline tab is opened.
export const listCaseTimeline = async (
  caseId: string
): Promise<{ data: CaseTimelineEvent[]; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('case_timeline')
      .select('*')
      .eq('case_id', caseId)
      .order('timestamp', { ascending: true });

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: (data as CaseTimelineEvent[]) || [], error: null };
  } catch (err: any) {
    return { data: [], error: err.message || 'Failed to fetch case timeline' };
  }
};

// Store a clear, human-readable record of an AI analysis result.
export const addCaseTimelineEvent = async (
  caseId: string,
  event: string,
  description: string
): Promise<{ error: string | null }> => {
  try {
    const { error } = await supabase.from('case_timeline').insert({
      case_id: caseId,
      event,
      description,
      timestamp: new Date().toISOString(),
    });

    return { error: error?.message || null };
  } catch (err: any) {
    return { error: err.message || 'Failed to record case timeline event' };
  }
};

// Helper: preview the next case number in the create form (e.g. DF-001).
export const generateCaseNumber = async (): Promise<string> => getNextCaseNumber();
