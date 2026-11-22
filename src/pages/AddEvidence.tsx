import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { addEvidence, listEvidenceByCase, uploadEvidenceFile } from '../services/evidenceService';
import { addCaseTimelineEvent, getCaseById } from '../services/caseService';
import { EvidenceType } from '../types/evidence';
import { useAuth } from '../context/AuthContext';
import { onNewEvidenceAdded } from '../ai/intelligentAgent';
import { scoreEvidencePair } from '../ai/heuristicMatcher';
import { FilePlus, ArrowLeft, Upload, AlertCircle } from 'lucide-react';

export const AddEvidence: React.FC = () => {
  const { id: caseId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();

  const [evidenceType, setEvidenceType] = useState<EvidenceType>('Screenshot');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('');
  const [timestamp, setTimestamp] = useState(new Date().toISOString().slice(0, 16));
  const [ipAddress, setIpAddress] = useState('');
  const [device, setDevice] = useState('');
  const [relatedEvent, setRelatedEvent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId) return;

    setError(null);
    setLoading(true);

    try {
      let fileUrl: string | undefined = undefined;

      // 1. Upload file if selected
      if (file) {
        const { fileUrl: uploadedUrl, error: uploadErr } = await uploadEvidenceFile(file);
        if (uploadErr) {
          setError(`File upload warning: ${uploadErr}. Proceeding without file attachment.`);
        } else if (uploadedUrl) {
          fileUrl = uploadedUrl;
        }
      }

      // 2. Parse comma-separated tags
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      // 3. Save evidence record
      const { data: createdEvidence, error: addErr } = await addEvidence({
        case_id: caseId,
        evidence_type: evidenceType,
        title,
        description,
        source,
        timestamp,
        ip_address: ipAddress || undefined,
        device: device || undefined,
        related_event: relatedEvent || undefined,
        tags,
        file_url: fileUrl,
      });

      if (addErr) {
        setError(addErr);
      } else {
        if (createdEvidence) {
          // Analyze in the background so AI or timeline failures never undo a saved artifact.
          void (async () => {
            try {
              const [{ data: savedCase, error: caseError }, { data: evidenceItems, error: evidenceError }] = await Promise.all([
                getCaseById(caseId),
                listEvidenceByCase(caseId),
              ]);

              if (caseError) throw new Error(caseError);
              if (evidenceError) throw new Error(evidenceError);

              const allEvidence = [
                createdEvidence,
                ...evidenceItems.filter((item) => item.id !== createdEvidence.id),
              ];
              const analysis = onNewEvidenceAdded(caseId, createdEvidence, allEvidence, savedCase);
              const relatedPairs = allEvidence
                .filter((item) => item.id !== createdEvidence.id)
                .map((item) => scoreEvidencePair(createdEvidence, item))
                .filter((pair) => pair.score >= 30);

              const timelineDescription = relatedPairs.length > 0
                ? `New evidence '${createdEvidence.title}' relates to ${relatedPairs.length} existing item${relatedPairs.length === 1 ? '' : 's'} (Score: ${Math.max(...relatedPairs.map((pair) => pair.score))}%).`
                : `No strong relationships found for new evidence '${createdEvidence.title}'.`;
              const timelineEvent = relatedPairs.length > 0
                ? 'AI Detected Related Evidence'
                : 'AI Analysis';
              if (savedCase && analysis.newPriority !== savedCase.priority) {
                const alertMessage = `⚠ AI Alert: New evidence increases case relevance. Recommended priority: ${analysis.newPriority}. Review in AI Analysis tab.`;
                try {
                  sessionStorage.setItem(`case-ai-alert-${caseId}`, alertMessage);
                } catch (storageError) {
                  console.warn('Could not preserve the AI alert for the case page:', storageError);
                }
                window.dispatchEvent(new CustomEvent('case-ai-alert', {
                  detail: { caseId, message: alertMessage },
                }));
              }

              const { error: timelineError } = await addCaseTimelineEvent(
                caseId,
                timelineEvent,
                relatedPairs.length > 0
                  ? `AI Detected Related Evidence: ${timelineDescription}`
                  : `AI Analysis: ${timelineDescription}`
              );
              if (timelineError) console.error('Could not record the AI timeline event:', timelineError);
            } catch (analysisError) {
              console.error('Post-save AI evidence analysis failed:', analysisError);
            }
          })();
        }
        navigate(`/cases/${caseId}`);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while adding evidence.');
    } finally {
      setLoading(false);
    }
  };

  if (role === 'VIEWER') {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center text-slate-400">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-200">Permission Denied</h2>
        <p className="text-xs text-slate-400 mt-1 mb-4">Viewer role cannot upload evidence.</p>
        <Link to={`/cases/${caseId}`} className="text-xs text-cyan-400 underline">
          Back to case
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Back link */}
      <Link
        to={`/cases/${caseId}`}
        className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-cyan-400 mb-6 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Case Workbench</span>
      </Link>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
        <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-slate-800">
          <div className="p-2 bg-cyan-950/60 border border-cyan-800 rounded-lg">
            <FilePlus className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Add Evidence Artifact</h1>
            <p className="text-xs text-slate-400">Attach digital evidence, logs, or file samples.</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-rose-950/50 border border-rose-800 rounded-lg flex items-center space-x-2 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Evidence Type */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Evidence Type
              </label>
              <select
                value={evidenceType}
                onChange={(e) => setEvidenceType(e.target.value as EvidenceType)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="Screenshot">Screenshot</option>
                <option value="Email">Email</option>
                <option value="Log File">Log File</option>
                <option value="IP Address">IP Address</option>
                <option value="Device Information">Device Information</option>
                <option value="File">File</option>
                <option value="URL">URL</option>
                <option value="Message">Message</option>
                <option value="Timestamp/Event">Timestamp/Event</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Evidence Title */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Evidence Title
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Server Auth Log Snippet"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Description & Findings
            </label>
            <textarea
              rows={3}
              placeholder="Describe what this evidence shows or contains..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Source */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Source System / User
              </label>
              <input
                type="text"
                placeholder="e.g., Auth Server / User JS"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* IP Address */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                IP Address (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., 192.168.1.100"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-cyan-300 font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Device */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Device Info (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., MacBook Pro / iPhone 14"
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Timestamp */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Event Timestamp
              </label>
              <input
                type="datetime-local"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Related Event */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Related Event (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Failed Login Attempt #3"
                value={relatedEvent}
                onChange={(e) => setRelatedEvent(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Tags (Comma separated)
            </label>
            <input
              type="text"
              placeholder="e.g., login, auth-failure, external-ip"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* File Upload to Supabase Storage "evidence-files" */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Upload File / Image Attachment
            </label>
            <div className="flex items-center space-x-3 bg-slate-950 border border-slate-800 rounded-lg p-3">
              <Upload className="w-5 h-5 text-cyan-400 shrink-0" />
              <input
                type="file"
                onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                className="text-xs text-slate-300 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-cyan-950 file:text-cyan-400 border-0 focus:outline-none"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-4 flex justify-end space-x-3">
            <Link
              to={`/cases/${caseId}`}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 text-xs font-semibold rounded-lg shadow-lg shadow-cyan-950 transition"
            >
              {loading ? 'Adding Evidence...' : 'Save Evidence'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
