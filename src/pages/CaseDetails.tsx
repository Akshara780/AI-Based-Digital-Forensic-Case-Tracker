import React, { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { getCaseById, listCaseTimeline, updateCaseStatus, updateCasePriority } from '../services/caseService';
import { listEvidenceByCase, deleteEvidence } from '../services/evidenceService';
import { addCaseNote, CaseNote, listCaseNotes } from '../services/caseNoteService';
import { Case, CaseStatus, CaseTimelineEvent, Priority } from '../types/case';
import { Evidence } from '../types/evidence';
import { useAuth } from '../context/AuthContext';
import { scoreAllEvidenceForCase } from '../ai/heuristicMatcher';
import { onCaseCreated, onNewEvidenceAdded } from '../ai/intelligentAgent';
import { MlPredictionCard } from '../components/MlPredictionCard';
import {
  ArrowLeft,
  Plus,
  Trash2,
  ExternalLink,
  Info,
  FileText,
  Brain,
  Clock,
  Network,
  StickyNote,
  Printer,
  Mail,
  Image,
  MessageSquare,
  Link2,
  Tag,
  Monitor,
  Globe,
  Calendar,
  UserCheck,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  CircleDot
} from 'lucide-react';

type TabType = 'Overview' | 'Evidence' | 'AI Analysis' | 'Timeline' | 'Relationships' | 'Notes';

export const CaseDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { role, user, profile } = useAuth();

  const requestedTab = searchParams.get('tab');
  const initialTab: TabType = ['Overview', 'Evidence', 'AI Analysis', 'Timeline', 'Relationships', 'Notes'].includes(requestedTab || '')
    ? requestedTab as TabType
    : 'Overview';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<CaseTimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState<boolean>(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [notesLoading, setNotesLoading] = useState<boolean>(false);
  const [notesSaving, setNotesSaving] = useState<boolean>(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [aiAlert, setAiAlert] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState<boolean>(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<ReturnType<typeof onNewEvidenceAdded> | null>(null);
  const [aiReasoningOpen, setAiReasoningOpen] = useState<boolean>(true);
  const [applyingPriority, setApplyingPriority] = useState<boolean>(false);

  const canWrite = role === 'INVESTIGATOR' || role === 'ADMIN';

  const priorityBadgeClasses: Record<Priority, string> = {
    LOW: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30',
    MEDIUM: 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/30',
    HIGH: 'bg-orange-500/10 text-orange-300 border border-orange-500/30',
    CRITICAL: 'bg-red-500/10 text-red-300 border border-red-500/30',
  };

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    const { data: caseRes, error: caseErr } = await getCaseById(id);

    if (caseErr || !caseRes) {
      setError(caseErr || 'Case not found.');
      setLoading(false);
      return;
    }

    setCaseData(caseRes);

    const { data: evidenceRes } = await listEvidenceByCase(id);
    setEvidenceList(evidenceRes);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const storageKey = `case-ai-alert-${id}`;
    const storedAlert = sessionStorage.getItem(storageKey);
    if (storedAlert) {
      setAiAlert(storedAlert);
      sessionStorage.removeItem(storageKey);
    }

    const handleAiAlert = (event: Event) => {
      const detail = (event as CustomEvent<{ caseId: string; message: string }>).detail;
      if (detail?.caseId === id) setAiAlert(detail.message);
    };

    window.addEventListener('case-ai-alert', handleAiAlert);
    return () => window.removeEventListener('case-ai-alert', handleAiAlert);
  }, [id]);

  useEffect(() => {
    if (activeTab !== 'Timeline' || !id) return;

    let isMounted = true;
    setTimelineLoading(true);
    setTimelineError(null);
    listCaseTimeline(id).then(({ data, error }) => {
      if (!isMounted) return;
      setTimeline(data);
      setTimelineError(error);
      setTimelineLoading(false);
    }).catch((timelineFetchError) => {
      if (!isMounted) return;
      setTimelineError('Unable to load the case timeline.');
      setTimelineLoading(false);
      console.error('Timeline fetch failed:', timelineFetchError);
    });

    return () => {
      isMounted = false;
    };
  }, [activeTab, id]);

  useEffect(() => {
    if (activeTab !== 'Notes' || !id) return;

    let isMounted = true;
    setNotesLoading(true);
    setNotesError(null);
    listCaseNotes(id).then(({ data, error }) => {
      if (!isMounted) return;
      setNotes(data);
      setNotesError(error);
      setNotesLoading(false);
    }).catch((notesFetchError) => {
      if (!isMounted) return;
      setNotesError('Unable to load case notes.');
      setNotesLoading(false);
      console.error('Case notes fetch failed:', notesFetchError);
    });

    return () => {
      isMounted = false;
    };
  }, [activeTab, id]);

  useEffect(() => {
    if (activeTab !== 'AI Analysis' || !caseData) return;

    let isMounted = true;
    setAiAnalysisLoading(true);

    if (evidenceList.length > 0) {
      const result = onNewEvidenceAdded(caseData.id, evidenceList[evidenceList.length - 1], evidenceList, caseData);
      if (isMounted) {
        setAiAnalysisResult(result);
        setAiAnalysisLoading(false);
      }
    } else {
      const result = onCaseCreated(caseData);
      if (isMounted) {
        setAiAnalysisResult(result);
        setAiAnalysisLoading(false);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [activeTab, caseData, evidenceList]);

  const handleStatusChange = async (newStatus: CaseStatus) => {
    if (!id) return;
    setUpdatingStatus(true);
    const { data, error: statusErr } = await updateCaseStatus(id, newStatus);
    setUpdatingStatus(false);
    if (!statusErr && data) {
      setCaseData(data);
    }
  };

  const handlePriorityApply = async () => {
    if (!id || !caseData || !aiAnalysisResult) return;
    if (aiAnalysisResult.newPriority === caseData.priority) return;

    setApplyingPriority(true);
    const { data, error } = await updateCasePriority(
      id,
      aiAnalysisResult.newPriority,
      caseData.priority,
      aiAnalysisResult.explanationSummary
    );
    setApplyingPriority(false);

    if (!error && data) {
      setCaseData(data);
    }
  };

  const handleDeleteEvidence = async (evidenceId: string) => {
    if (!confirm('Are you sure you want to delete this evidence record?')) return;
    const { success } = await deleteEvidence(evidenceId);
    if (success) {
      setEvidenceList((prev) => prev.filter((e) => e.id !== evidenceId));
    }
  };

  const handleAddNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = noteDraft.trim();
    if (!id || !user || !canWrite || !content) return;

    setNotesSaving(true);
    setNotesError(null);
    const { data, error: noteError } = await addCaseNote({
      case_id: id,
      author_id: user.id,
      author_name: profile?.full_name?.trim() || user.email || 'Investigator',
      content,
    });
    setNotesSaving(false);

    if (noteError || !data) {
      setNotesError(noteError || 'Unable to save this note.');
      return;
    }

    setNotes((existingNotes) => [data, ...existingNotes]);
    setNoteDraft('');
  };

  if (loading) {
    return <div className="text-center py-20 text-slate-400 text-xs">Loading case workbench...</div>;
  }

  if (error || !caseData) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center">
        <p className="text-rose-400 text-sm font-semibold mb-4">{error || 'Case not found.'}</p>
        <Link to="/cases" className="text-xs text-cyan-400 underline">
          Return to cases
        </Link>
      </div>
    );
  }

  const tabs: { name: TabType; icon: React.ReactNode }[] = [
    { name: 'Overview', icon: <Info className="w-4 h-4" /> },
    { name: 'Evidence', icon: <FileText className="w-4 h-4" /> },
    { name: 'AI Analysis', icon: <Brain className="w-4 h-4 text-purple-400" /> },
    { name: 'Timeline', icon: <Clock className="w-4 h-4 text-amber-400" /> },
    { name: 'Relationships', icon: <Network className="w-4 h-4 text-cyan-400" /> },
    { name: 'Notes', icon: <StickyNote className="w-4 h-4 text-emerald-400" /> },
  ];

  // The matcher checks each unique evidence pair using explainable scoring rules.
  const relationshipPairs = scoreAllEvidenceForCase(evidenceList, { timeWindowMinutes: 15 });
  const graphRows = Math.ceil(evidenceList.length / 2);
  const graphHeight = Math.max(220, graphRows * 140 + 30);
  const graphNodes = evidenceList.map((item, index) => ({
    item,
    x: index % 2 === 0 ? 250 : 650,
    y: 70 + Math.floor(index / 2) * 140,
  }));
  const nodePositionById = new Map(graphNodes.map((node) => [node.item.id, node]));
  const selectedEvidence = evidenceList.find((item) => item.id === selectedEvidenceId) || evidenceList[0];
  const selectedRelationships = selectedEvidence
    ? relationshipPairs
      .filter((pair) => pair.evidenceAId === selectedEvidence.id || pair.evidenceBId === selectedEvidence.id)
      .map((pair) => ({
        pair,
        otherTitle: pair.evidenceAId === selectedEvidence.id ? pair.evidenceBTitle : pair.evidenceATitle,
      }))
    : [];

  const getEvidenceIcon = (type: Evidence['evidence_type']) => {
    const iconClass = 'h-5 w-5';
    switch (type) {
      case 'IP Address': return <Globe className={iconClass} />;
      case 'Device Information': return <Monitor className={iconClass} />;
      case 'Email': return <Mail className={iconClass} />;
      case 'Screenshot': return <Image className={iconClass} />;
      case 'URL': return <Link2 className={iconClass} />;
      case 'Message': return <MessageSquare className={iconClass} />;
      case 'Timestamp/Event': return <Clock className={iconClass} />;
      default: return <FileText className={iconClass} />;
    }
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-4 lg:px-8 py-8">
      {/* Back button */}
      <Link
        to="/cases"
        className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-cyan-400 mb-6 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Cases</span>
      </Link>

      {/* Case Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <span className="font-mono text-xs font-bold text-cyan-400 bg-cyan-950/60 px-2.5 py-1 rounded border border-cyan-800">
                {caseData.case_number}
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold border bg-slate-800 border-slate-700 text-slate-300">
                {caseData.case_type}
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-100">{caseData.title}</h1>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Link
              to={`/cases/${caseData.id}/report`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-700 hover:text-cyan-300"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Generate Report</span>
            </Link>
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${priorityBadgeClasses[caseData.priority]}`}>
              {caseData.priority}
            </span>

            {/* Quick status updater for Investigator/Admin */}
            <span className="text-xs text-slate-400">Status:</span>
            {canWrite ? (
              <select
                disabled={updatingStatus}
                value={caseData.status}
                onChange={(e) => handleStatusChange(e.target.value as CaseStatus)}
                className="bg-slate-950 border border-slate-800 text-xs text-cyan-400 font-semibold px-3 py-1.5 rounded-lg focus:outline-none focus:border-cyan-500"
              >
                <option value="OPEN">OPEN</option>
                <option value="UNDER_INVESTIGATION">UNDER INVESTIGATION</option>
                <option value="EVIDENCE_ADDED">EVIDENCE ADDED</option>
                <option value="ANALYSIS">ANALYSIS</option>
                <option value="REVIEW">REVIEW</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            ) : (
              <span className="text-xs font-semibold px-3 py-1 rounded bg-slate-800 text-slate-200">
                {caseData.status}
              </span>
            )}
          </div>
        </div>
      </div>

      {aiAlert && (
        <div role="status" className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-xs text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <span>{aiAlert}</span>
          </div>
          <button onClick={() => setAiAlert(null)} className="text-amber-300 hover:text-white" aria-label="Dismiss AI alert">×</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto border-b border-slate-800 mb-6 scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.name}
            onClick={() => setActiveTab(tab.name)}
            className={`flex items-center space-x-2 px-4 py-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === tab.name
                ? 'border-cyan-400 text-cyan-400 bg-slate-900/50'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            {tab.icon}
            <span>{tab.name}</span>
            {tab.name === 'Evidence' && (
              <span className="ml-1 px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded text-[10px]">
                {evidenceList.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'Overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md">
            <h2 className="text-sm font-semibold text-slate-200 mb-3 border-b border-slate-800 pb-2">
              Case Summary & Description
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
              {caseData.description || 'No detailed description provided for this case.'}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-md">
            <h2 className="text-sm font-semibold text-slate-200 border-b border-slate-800 pb-2">
              Metadata & Attributes
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Priority Level:</span>
                <span className="font-semibold text-amber-400">{caseData.priority}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center space-x-1">
                  <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                  <span>Investigator:</span>
                </span>
                <span className="text-slate-200">{caseData.investigator || 'Unassigned'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Date Reported:</span>
                </span>
                <span className="text-slate-200">
                  {new Date(caseData.date_reported).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EVIDENCE */}
      {activeTab === 'Evidence' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">
              Evidence Locker ({evidenceList.length} items)
            </h2>

            {/* Role rule: VIEWER cannot see Add Evidence button */}
            {canWrite && (
              <Link
                to={`/cases/${caseData.id}/evidence/new`}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs rounded-lg transition"
              >
                <Plus className="w-4 h-4" />
                <span>Add Evidence</span>
              </Link>
            )}
          </div>

          {evidenceList.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
              <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-medium">No evidence added yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Upload artifacts, network logs, or screenshots to begin analysis.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {evidenceList.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-900">
                        {item.evidence_type}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-100 mb-1">{item.title}</h3>
                    <p className="text-xs text-slate-400 mb-3">{item.description}</p>

                    <div className="space-y-1.5 text-xs text-slate-400 border-t border-slate-800/80 pt-3">
                      {item.source && (
                        <div>
                          <span className="text-slate-500 font-medium">Source:</span> {item.source}
                        </div>
                      )}
                      {item.ip_address && (
                        <div className="flex items-center space-x-1">
                          <Globe className="w-3.5 h-3.5 text-cyan-500" />
                          <span>IP Address:</span>
                          <span className="font-mono text-cyan-300">{item.ip_address}</span>
                        </div>
                      )}
                      {item.device && (
                        <div className="flex items-center space-x-1">
                          <Monitor className="w-3.5 h-3.5 text-purple-400" />
                          <span>Device:</span>
                          <span className="text-slate-200">{item.device}</span>
                        </div>
                      )}
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex items-center flex-wrap gap-1 pt-1">
                          <Tag className="w-3 h-3 text-slate-500" />
                          {item.tags.map((t, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <MlPredictionCard
                    evidence={item}
                    caseData={caseData}
                    allEvidence={evidenceList}
                  />

                  {/* Actions & File URL */}
                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                    {item.file_url ? (
                      <a
                        href={item.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1 text-cyan-400 hover:text-cyan-300 font-medium"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>View Attachment</span>
                      </a>
                    ) : (
                      <span className="text-slate-600 text-[11px]">No file attached</span>
                    )}

                    {/* Role rule: VIEWER cannot see Delete button */}
                    {canWrite && (
                      <button
                        onClick={() => handleDeleteEvidence(item.id)}
                        className="text-rose-400 hover:text-rose-300 p-1 transition"
                        title="Delete evidence"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AI ANALYSIS */}
      {activeTab === 'AI Analysis' && (
        <div className="space-y-6">
          {aiAnalysisLoading ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 shadow-md">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
              <p className="text-sm font-medium text-slate-300">Running adaptive case analysis…</p>
            </div>
          ) : aiAnalysisResult ? (
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-5">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">Before Priority</div>
                    <div className="text-3xl font-black text-slate-400">{aiAnalysisResult.previousPriority}</div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-5">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">After Priority</div>
                    <div className={`text-4xl font-black ${
                      aiAnalysisResult.newPriority === 'LOW'
                        ? 'text-emerald-400'
                        : aiAnalysisResult.newPriority === 'MEDIUM'
                          ? 'text-yellow-400'
                          : aiAnalysisResult.newPriority === 'HIGH'
                            ? 'text-orange-400'
                            : 'text-red-400'
                    }`}>
                      {aiAnalysisResult.newPriority}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-4 flex-wrap">
                  <div className="text-base font-semibold text-slate-200">{aiAnalysisResult.explanationSummary}</div>
                  <button
                    onClick={handlePriorityApply}
                    disabled={applyingPriority || !aiAnalysisResult.priorityChanged || aiAnalysisResult.newPriority === caseData.priority}
                    className="px-4 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                  >
                    {applyingPriority ? 'Applying…' : 'Apply Priority Update'}
                  </button>
                </div>

                <div className="mt-3 text-xs text-slate-400">
                  {aiAnalysisResult.priorityChanged ? 'Priority changed and requires confirmation.' : 'Priority remains the same; no recommendation to apply.'}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">Evidence Relevance Breakdown</h3>

                {scoreAllEvidenceForCase(evidenceList, { timeWindowMinutes: 15 }).length === 0 ? (
                  <div className="text-xs text-slate-400">Not enough evidence pairs are available to compute relevance scores.</div>
                ) : (
                  <div className="space-y-4">
                    {scoreAllEvidenceForCase(evidenceList, { timeWindowMinutes: 15 }).map((pair, index) => (
                      <div key={`${pair.evidenceAId}-${pair.evidenceBId}-${index}`} className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                          <div className="text-sm font-semibold text-slate-100">
                            {pair.evidenceATitle} <span className="text-slate-500">↔</span> {pair.evidenceBTitle}
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full font-semibold border ${
                            pair.score >= 70
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                              : pair.score >= 40
                                ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}>
                            {pair.score}%
                          </span>
                        </div>
                        <ul className="space-y-1.5">
                          {pair.reasons.length === 0 ? (
                            <li className="text-xs text-slate-500 italic">No matching heuristics.</li>
                          ) : (
                            pair.reasons.map((reason, reasonIndex) => (
                              <li key={`${pair.evidenceAId}-${pair.evidenceBId}-${reasonIndex}`} className="text-xs text-slate-300 flex items-start gap-2">
                                <span className="text-emerald-400 font-bold mt-0.5">✓</span>
                                <span>{reason}</span>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md">
                <button
                  onClick={() => setAiReasoningOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <h3 className="text-sm font-semibold text-slate-200">AI Reasoning</h3>
                  {aiReasoningOpen ? <ChevronUp className="w-4 h-4 text-slate-300" /> : <ChevronDown className="w-4 h-4 text-slate-300" />}
                </button>

                {aiReasoningOpen && (
                  <div className="mt-5 space-y-5">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Forward-Chaining Rules Fired</div>
                      {aiAnalysisResult.firedRules.length === 0 ? (
                        <div className="text-xs text-slate-400 italic">No forward-chaining rules fired.</div>
                      ) : (
                        <div className="space-y-3">
                          {aiAnalysisResult.firedRules.map((rule, index) => (
                            <div key={`${rule.ruleId}-${index}`} className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                              <div className="text-xs text-amber-300 font-semibold">{rule.ruleId}</div>
                              <div className="text-xs text-slate-300 mt-1">{rule.description}</div>
                              <div className="text-xs text-slate-400 mt-2">
                                Derived fact: {rule.resultFact.subject} / {rule.resultFact.predicate} = {String(rule.resultFact.value)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Backward-Chaining Check</div>
                      {aiAnalysisResult.backwardCheck ? (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                          <div className="text-xs text-cyan-300 font-semibold">Conclusion: {aiAnalysisResult.backwardCheck.conclusion}</div>
                          {aiAnalysisResult.backwardCheck.steps.map((step, index) => (
                            <div key={`${step.question}-${index}`} className="flex items-start gap-3">
                              <span className={`mt-0.5 text-xs font-bold ${step.result ? 'text-emerald-400' : 'text-slate-500'}`}>
                                {step.result ? '✓' : '✗'}
                              </span>
                              <div>
                                <div className="text-xs text-slate-200 font-medium">{step.question}</div>
                                <div className="text-xs text-slate-400">{step.detail}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 italic">No backward check was produced because this case has no evidence.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">Constraint Check Summary</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">Total Pairs</div>
                    <div className="text-2xl font-bold text-slate-200">{aiAnalysisResult.constraintSummary.totalPairs}</div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">Valid</div>
                    <div className="text-2xl font-bold text-emerald-400">{aiAnalysisResult.constraintSummary.validPairs}</div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">Invalid</div>
                    <div className="text-2xl font-bold text-rose-400">{aiAnalysisResult.constraintSummary.invalidPairs}</div>
                  </div>
                </div>

                {aiAnalysisResult.constraintSummary.failingPairs.length === 0 ? (
                  <div className="text-xs text-slate-400 italic">No constraint violations were detected.</div>
                ) : (
                  <ul className="space-y-2">
                    {aiAnalysisResult.constraintSummary.failingPairs.map((violation, index) => (
                      <li key={`${violation}-${index}`} className="text-xs text-rose-300 flex items-start gap-2">
                        <span className="font-bold mt-0.5">✗</span>
                        <span>{violation}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">Suggested Next Steps</h3>
                <ul className="space-y-2">
                  {aiAnalysisResult.suggestedNextSteps.map((step, index) => (
                    <li key={`${step}-${index}`} className="text-sm text-slate-200 flex items-start gap-2">
                      <span className="text-cyan-400 font-bold mt-0.5">→</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {activeTab === 'Timeline' && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md" aria-label="Case timeline">
          <h2 className="text-sm font-semibold text-slate-200 mb-6">Case Timeline</h2>
          {timelineLoading ? (
            <p className="text-xs text-slate-400">Loading case history...</p>
          ) : timelineError ? (
            <p role="alert" className="text-xs text-rose-300">{timelineError}</p>
          ) : timeline.length === 0 ? (
            <p className="text-xs text-slate-400">No timeline events have been recorded for this case.</p>
          ) : (
            <ol className="space-y-0">
              {timeline.map((entry, index) => {
                const isCreated = entry.event === 'Case Created';
                const isRelatedEvidence = entry.event === 'AI Detected Related Evidence';
                const isReprioritization = entry.event === 'AI Reprioritization';
                const recommendedPriority = isReprioritization
                  ? entry.description.match(/\bto (LOW|MEDIUM|HIGH|CRITICAL)\b/i)?.[1]?.toUpperCase()
                  : undefined;
                const colorClasses = isCreated
                  ? 'border-sky-500 bg-sky-500 text-sky-300'
                  : isRelatedEvidence
                    ? 'border-purple-500 bg-purple-500 text-purple-300'
                    : isReprioritization
                      ? recommendedPriority === 'CRITICAL'
                        ? 'border-red-500 bg-red-500 text-red-300'
                        : recommendedPriority === 'HIGH'
                          ? 'border-orange-500 bg-orange-500 text-orange-300'
                          : recommendedPriority === 'MEDIUM'
                            ? 'border-yellow-500 bg-yellow-500 text-yellow-300'
                            : 'border-emerald-500 bg-emerald-500 text-emerald-300'
                      : 'border-slate-500 bg-slate-500 text-slate-300';
                const EventIcon = isCreated
                  ? CheckCircle2
                  : isRelatedEvidence
                    ? AlertTriangle
                    : isReprioritization
                      ? AlertTriangle
                      : CircleDot;

                return (
                  <li key={entry.id} className="relative flex gap-4 pb-7 last:pb-0">
                    {index < timeline.length - 1 && (
                      <span aria-hidden="true" className="absolute left-[9px] top-5 h-full w-px bg-slate-700" />
                    )}
                    <span className={`relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-slate-950 ${colorClasses.split(' ')[0]}`}>
                      <EventIcon className={`h-3 w-3 ${colorClasses.split(' ')[2]}`} />
                    </span>
                    <div className="min-w-0 flex-1 border-b border-slate-800 pb-5 last:border-0 last:pb-0">
                      <time className="block text-[11px] text-slate-500" dateTime={entry.timestamp}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </time>
                      <h3 className={`mt-1 text-xs font-semibold ${colorClasses.split(' ')[2]}`}>{entry.event}</h3>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{entry.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

      {activeTab === 'Relationships' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5" aria-label="Evidence relationship graph">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">Evidence Relationship Graph</h2>
                <p className="mt-1 text-xs text-slate-400">Connections show heuristic relevance scores of 30% or higher.</p>
              </div>
              <span className="text-[11px] text-slate-500">{evidenceList.length} items / {relationshipPairs.filter((pair) => pair.score >= 30).length} connections</span>
            </div>
            {evidenceList.length === 0 ? (
              <p className="py-12 text-center text-xs text-slate-400">Add evidence to calculate relationships.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60">
                <svg className="min-w-[560px] w-full" viewBox={`0 0 900 ${graphHeight}`} role="img" aria-label="Evidence nodes connected by relevance score">
                  {relationshipPairs.filter((pair) => pair.score >= 30).map((pair) => {
                    const start = nodePositionById.get(pair.evidenceAId);
                    const end = nodePositionById.get(pair.evidenceBId);
                    if (!start || !end) return null;
                    const stroke = pair.score >= 70 ? '#34d399' : pair.score >= 45 ? '#fbbf24' : '#22d3ee';
                    return (
                      <line
                        key={`${pair.evidenceAId}-${pair.evidenceBId}`}
                        x1={start.x}
                        y1={start.y}
                        x2={end.x}
                        y2={end.y}
                        stroke={stroke}
                        strokeOpacity={0.35 + pair.score / 160}
                        strokeWidth={1 + pair.score / 25}
                      />
                    );
                  })}
                  {graphNodes.map(({ item, x, y }) => (
                    <g
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Show relationships for ${item.title}`}
                      onClick={() => setSelectedEvidenceId(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedEvidenceId(item.id);
                        }
                      }}
                      className="cursor-pointer"
                    >
                      <title>{`${item.title} (${item.evidence_type})`}</title>
                      <circle
                        cx={x}
                        cy={y}
                        r={25}
                        fill={selectedEvidence?.id === item.id ? '#164e63' : '#0f172a'}
                        stroke={selectedEvidence?.id === item.id ? '#22d3ee' : '#475569'}
                        strokeWidth="2"
                      />
                      <foreignObject x={x - 12} y={y - 12} width="24" height="24" className="pointer-events-none text-cyan-300">
                        {getEvidenceIcon(item.evidence_type)}
                      </foreignObject>
                      <text x={x} y={y + 43} textAnchor="middle" fill="#e2e8f0" fontSize="12">
                        {item.title.length > 28 ? `${item.title.slice(0, 25)}...` : item.title}
                      </text>
                      <text x={x} y={y + 59} textAnchor="middle" fill="#94a3b8" fontSize="10">{item.evidence_type}</text>
                    </g>
                  ))}
                </svg>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-slate-400">
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-cyan-400" />30-44%</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-400" />45-69%</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-400" />70%+</span>
            </div>
          </section>

          <aside className="rounded-xl border border-slate-800 bg-slate-900 p-5" aria-label="Selected evidence relationships">
            {selectedEvidence ? (
              <>
                <div className="border-b border-slate-800 pb-3">
                  <div className="mb-2 flex items-center gap-2 text-cyan-300">{getEvidenceIcon(selectedEvidence.evidence_type)}<span className="text-[11px] text-slate-400">{selectedEvidence.evidence_type}</span></div>
                  <h3 className="text-sm font-semibold text-slate-100">{selectedEvidence.title}</h3>
                  <p className="mt-1 text-xs text-slate-400">{selectedEvidence.description || 'No description provided.'}</p>
                </div>
                <h4 className="mb-3 mt-4 text-xs font-semibold text-slate-200">Relationship scores</h4>
                {selectedRelationships.length === 0 ? (
                  <p className="text-xs text-slate-400">No other evidence is available to compare.</p>
                ) : (
                  <ul className="space-y-3">
                    {selectedRelationships.map(({ pair, otherTitle }) => (
                      <li key={`${pair.evidenceAId}-${pair.evidenceBId}`} className="border-b border-slate-800 pb-3 last:border-0">
                        <div className="flex items-start justify-between gap-2 text-xs">
                          <span className="text-slate-200">{otherTitle}</span>
                          <span className={`shrink-0 font-semibold ${pair.score >= 70 ? 'text-emerald-300' : pair.score >= 30 ? 'text-amber-300' : 'text-slate-400'}`}>{pair.score}%</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{pair.reasons.length ? pair.reasons.join('; ') : 'No matching heuristics.'}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-400">Select an evidence node to inspect its scores.</p>
            )}
          </aside>
        </div>
      )}

      {activeTab === 'Notes' && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5" aria-label="Case notes">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Case Notes</h2>
              <p className="mt-1 text-xs text-slate-400">Manual notes recorded for this case.</p>
            </div>
            <span className="text-[11px] text-slate-500">{notes.length} notes</span>
          </div>

          {canWrite && (
            <form onSubmit={handleAddNote} className="mb-6 border-b border-slate-800 pb-5">
              <label htmlFor="case-note" className="mb-2 block text-xs font-medium text-slate-300">Add a note</label>
              <textarea
                id="case-note"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                rows={3}
                maxLength={5000}
                placeholder="Record an observation or case update..."
                className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[10px] text-slate-500">{noteDraft.length}/5000</span>
                <button
                  type="submit"
                  disabled={notesSaving || !noteDraft.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {notesSaving ? 'Adding...' : 'Add Note'}
                </button>
              </div>
            </form>
          )}

          {notesError && <p role="alert" className="mb-4 text-xs text-rose-300">{notesError}</p>}
          {notesLoading ? (
            <p className="py-6 text-center text-xs text-slate-400">Loading notes...</p>
          ) : notes.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">No notes have been added to this case.</p>
          ) : (
            <ol className="divide-y divide-slate-800">
              {notes.map((note) => (
                <li key={note.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span className="text-xs font-semibold text-slate-200">{note.author_name}</span>
                    <time className="text-[10px] text-slate-500" dateTime={note.created_at}>{new Date(note.created_at).toLocaleString()}</time>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-300">{note.content}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
};
