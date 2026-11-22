import { supabase } from './supabaseClient';
import { Evidence, EvidenceType } from '../types/evidence';

export interface AddEvidenceInput {
  case_id: string;
  evidence_type: EvidenceType;
  title: string;
  description: string;
  source: string;
  timestamp?: string;
  ip_address?: string;
  device?: string;
  related_event?: string;
  tags?: string[];
  status?: string;
  file_url?: string;
}

// 1. Upload file/image to Supabase Storage bucket named "evidence-files"
export const uploadEvidenceFile = async (
  file: File
): Promise<{ fileUrl: string | null; error: string | null }> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('evidence-files')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      return { fileUrl: null, error: uploadError.message };
    }

    const { data: publicUrlData } = supabase.storage
      .from('evidence-files')
      .getPublicUrl(filePath);

    return { fileUrl: publicUrlData.publicUrl, error: null };
  } catch (err: any) {
    return { fileUrl: null, error: err.message || 'File upload failed' };
  }
};

// 2. Add new evidence item & insert timeline record
export const addEvidence = async (
  input: AddEvidenceInput
): Promise<{ data: Evidence | null; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('evidence')
      .insert({
        case_id: input.case_id,
        evidence_type: input.evidence_type,
        title: input.title,
        description: input.description,
        source: input.source,
        timestamp: input.timestamp || new Date().toISOString(),
        ip_address: input.ip_address || null,
        device: input.device || null,
        related_event: input.related_event || null,
        tags: input.tags || [],
        status: input.status || 'ACTIVE',
        file_url: input.file_url || null,
      })
      .select('*')
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    const createdEvidence = data as Evidence;

    // Automatically record event in case_timeline
    await supabase.from('case_timeline').insert({
      case_id: input.case_id,
      event: 'Evidence Added',
      description: `Evidence Added: ${createdEvidence.title} (${createdEvidence.evidence_type})`,
      timestamp: new Date().toISOString(),
    });

    // Also update case status to 'EVIDENCE_ADDED' if currently 'OPEN'
    await supabase
      .from('cases')
      .update({ status: 'EVIDENCE_ADDED', updated_at: new Date().toISOString() })
      .eq('id', input.case_id)
      .eq('status', 'OPEN');

    return { data: createdEvidence, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to add evidence' };
  }
};

// 3. List evidence items by case ID
export const listEvidenceByCase = async (
  caseId: string
): Promise<{ data: Evidence[]; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('evidence')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: (data as Evidence[]) || [], error: null };
  } catch (err: any) {
    return { data: [], error: err.message || 'Failed to fetch evidence list' };
  }
};

// 4. Update evidence item
export const updateEvidence = async (
  id: string,
  updates: Partial<AddEvidenceInput>
): Promise<{ data: Evidence | null; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('evidence')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data as Evidence, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to update evidence' };
  }
};

// 5. Delete evidence item
export const deleteEvidence = async (
  id: string
): Promise<{ success: boolean; error: string | null }> => {
  try {
    const { error } = await supabase.from('evidence').delete().eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete evidence' };
  }
};
