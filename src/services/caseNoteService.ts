import { supabase } from './supabaseClient';

export interface CaseNote {
  id: string;
  case_id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

export interface CreateCaseNoteInput {
  case_id: string;
  author_id: string;
  author_name: string;
  content: string;
}

export const listCaseNotes = async (
  caseId: string
): Promise<{ data: CaseNote[]; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('case_notes')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: (data as CaseNote[]) || [], error: null };
  } catch (err) {
    return {
      data: [],
      error: err instanceof Error ? err.message : 'Failed to fetch case notes.',
    };
  }
};

export const addCaseNote = async (
  input: CreateCaseNoteInput
): Promise<{ data: CaseNote | null; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('case_notes')
      .insert(input)
      .select('*')
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as CaseNote, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Failed to add case note.',
    };
  }
};