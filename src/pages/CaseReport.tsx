import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { onCaseCreated, onNewEvidenceAdded } from '../ai/intelligentAgent';
import { scoreAllEvidenceForCase } from '../ai/heuristicMatcher';
import { Case, CaseTimelineEvent } from '../types/case';
import { describeRuleFinding, describeRuleDetails, plainReason, plainSummary } from '../ui/plainLanguage';
import { Evidence } from '../types/evidence';
import { getCaseById, listCaseTimeline } from '../services/caseService';
import { listEvidenceByCase } from '../services/evidenceService';
import { CaseNote, listCaseNotes } from '../services/caseNoteService';

type AnalysisResult = ReturnType<typeof onCaseCreated>;

export const CaseReport: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [timeline, setTimeline] = useState<CaseTimelineEvent[]>([]);
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [generatedAt] = useState<Date>(() => new Date());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('Case ID is missing.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    const loadReport = async () => {
      try {
        const [caseResult, evidenceResult, timelineResult, notesResult] = await Promise.all([
          getCaseById(id),
          listEvidenceByCase(id),
          listCaseTimeline(id),
          listCaseNotes(id),
        ]);

        if (!isMounted) return;
        if (caseResult.error || !caseResult.data) {
          setError(caseResult.error || 'Case not found.');
          return;
        }

        const caseEvidence = evidenceResult.data;
        setCaseData(caseResult.data);
        setEvidence(caseEvidence);
        setTimeline(timelineResult.data);
        setNotes(notesResult.data);
        setWarnings([
          evidenceResult.error,
          timelineResult.error,
          notesResult.error,
        ].filter((message): message is string => Boolean(message)));

        // Match AI Analysis: analyze with the last listed evidence item, or the case alone.
        const findings = caseEvidence.length > 0
          ? onNewEvidenceAdded(caseResult.data.id, caseEvidence[caseEvidence.length - 1], caseEvidence, caseResult.data)
          : onCaseCreated(caseResult.data);
        setAnalysis(findings);
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load the case report.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadReport();
    return () => { isMounted = false; };
  }, [id]);

  if (loading) {
    return <div className="py-20 text-center text-xs text-slate-400">Preparing case summary...</div>;
  }

  if (error || !caseData || !analysis) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p role="alert" className="mb-4 text-sm font-semibold text-rose-400">{error || 'Unable to compile this case report.'}</p>
        <Link to={id ? `/cases/${id}` : '/cases'} className="text-xs text-cyan-400 underline">Return to case</Link>
      </div>
    );
  }

  const relatedPairs = scoreAllEvidenceForCase(evidence, { timeWindowMinutes: 15 })
    .filter((pair) => pair.score > 0)
    .slice(0, 10);
  const investigator = caseData.investigator || 'Unassigned';

  return (
    <div className="case-report-shell mx-auto max-w-screen-2xl px-4 py-8 lg:px-8">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/cases/${caseData.id}`} className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-cyan-300">
          <ArrowLeft className="h-4 w-4" />
          Back to Case
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-500"
        >
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </button>
      </div>

      {warnings.length > 0 && (
        <div role="status" className="no-print mb-4 rounded-lg border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-xs text-amber-200">
          Some report sections could not be loaded: {warnings.join(' ')}
        </div>
      )}

      <article className="case-report-document rounded-lg border border-slate-300 bg-white p-8 text-slate-900 shadow-xl sm:p-10">
        <header className="border-b-2 border-slate-800 pb-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">AI-Based Digital Forensics Case Tracker</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-sm font-bold text-slate-700">{caseData.case_number}</p>
              <h1 className="mt-1 text-2xl font-bold leading-tight text-slate-950">{caseData.title}</h1>
              <p className="mt-1 text-sm text-slate-600">{caseData.case_type}</p>
            </div>
            <div className="text-left text-xs sm:text-right">
              <p><span className="font-semibold">Status:</span> {caseData.status.replace(/_/g, ' ')}</p>
              <p className="mt-1"><span className="font-semibold">Priority:</span> {caseData.priority}</p>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-slate-300 pt-4 text-xs sm:grid-cols-3">
            <div><dt className="font-semibold text-slate-600">Investigator</dt><dd className="mt-0.5">{investigator}</dd></div>
            <div><dt className="font-semibold text-slate-600">Date Reported</dt><dd className="mt-0.5">{new Date(caseData.date_reported).toLocaleString()}</dd></div>
            <div><dt className="font-semibold text-slate-600">Report Generated</dt><dd className="mt-0.5">{generatedAt.toLocaleString()}</dd></div>
          </dl>
        </header>

        <section className="mt-5 break-inside-avoid">
          <h2 className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-wide">Case Description</h2>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">{caseData.description || 'No case description recorded.'}</p>
        </section>

        <section className="mt-5">
          <h2 className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-wide">Evidence Summary</h2>
          {evidence.length === 0 ? (
            <p className="mt-2 text-xs">No evidence has been recorded for this case.</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-left text-[10px]">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="w-[12%] border border-slate-300 p-1.5">Type</th>
                    <th className="w-[19%] border border-slate-300 p-1.5">Title</th>
                    <th className="w-[17%] border border-slate-300 p-1.5">Source</th>
                    <th className="w-[18%] border border-slate-300 p-1.5">Timestamp</th>
                    <th className="w-[17%] border border-slate-300 p-1.5">Device</th>
                    <th className="w-[17%] border border-slate-300 p-1.5">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.map((item) => (
                    <tr key={item.id}>
                      <td className="break-words border border-slate-300 p-1.5">{item.evidence_type}</td>
                      <td className="break-words border border-slate-300 p-1.5">{item.title}</td>
                      <td className="break-words border border-slate-300 p-1.5">{item.source || '—'}</td>
                      <td className="break-words border border-slate-300 p-1.5">{new Date(item.timestamp).toLocaleString()}</td>
                      <td className="break-words border border-slate-300 p-1.5">{item.device || '—'}</td>
                      <td className="break-words border border-slate-300 p-1.5">{item.ip_address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-5 break-inside-avoid">
          <h2 className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-wide">Automated Analysis Summary</h2>
          <p className="mt-2 text-xs text-slate-700">These results come from automated checks. They are suggestions to help review the case, not proof of wrongdoing. All findings must be confirmed by the investigator.</p>
          <p className="mt-2 text-xs"><span className="font-semibold">Suggested priority: {analysis.newPriority}.</span> {plainSummary(analysis.explanationSummary)}</p>
          <h3 className="mt-3 text-xs font-bold">Warning-sign checks that matched</h3>
          {analysis.firedRules.length === 0 ? (
            <p className="mt-1 text-xs">No warning-sign checks matched.</p>
          ) : (
            <ul className="mt-1 space-y-2 text-xs">
              {analysis.firedRules.map((rule, index) => {
                const details = describeRuleDetails(rule, evidence);
                return (
                  <li key={`${rule.ruleId}-${index}`} className="break-inside-avoid rounded border border-slate-200 bg-slate-50 p-2">
                    <div>{describeRuleFinding(rule, evidence)}</div>
                    <details className="mt-1 text-[11px] text-slate-600">
                      <summary className="cursor-pointer">How was this found?</summary>
                      <div className="mt-1 space-y-0.5 text-slate-500">
                        <div>Check: {details.checkName}</div>
                        <div>What this check does: {details.whatItDoes}</div>
                        <div>Result: {details.result}</div>
                        <div className="text-[10px] text-slate-500">Internal name (for developers): {rule.ruleId}</div>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
          <h3 className="mt-3 text-xs font-bold">How evidence items may be linked</h3>
          {relatedPairs.length === 0 ? (
            <p className="mt-1 text-xs">No possible links were found between evidence items.</p>
          ) : (
            <ul className="mt-1 space-y-1.5 text-xs">
              {relatedPairs.map((pair) => (
                <li key={`${pair.evidenceAId}-${pair.evidenceBId}`}>
                  <span className="font-semibold">{pair.evidenceATitle} / {pair.evidenceBTitle}: {pair.score} out of 100.</span>{' '}
                  {pair.reasons.length ? pair.reasons.map(plainReason).join('; ') : 'No shared details found.'}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-5 break-inside-avoid">
          <h2 className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-wide">Consistency check summary</h2>
          <p className="mt-2 text-xs">Compared {analysis.constraintSummary.totalPairs} evidence pairs: {analysis.constraintSummary.validPairs} with no issues found, {analysis.constraintSummary.invalidPairs} needing review.</p>
        </section>

        <section className="mt-5">
          <h2 className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-wide">Investigation Timeline</h2>
          {timeline.length === 0 ? (
            <p className="mt-2 text-xs">No timeline events have been recorded.</p>
          ) : (
            <ol className="mt-2 space-y-2">
              {timeline.map((event) => (
                <li key={event.id} className="break-inside-avoid border-l-2 border-slate-400 pl-3 text-xs">
                  <p className="font-semibold">{new Date(event.timestamp).toLocaleString()} | {event.event}</p>
                  <p className="mt-0.5 leading-relaxed">{event.description}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="mt-5">
          <h2 className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-wide">Investigation Notes</h2>
          {notes.length === 0 ? (
            <p className="mt-2 text-xs">No investigation notes have been recorded.</p>
          ) : (
            <ol className="mt-2 space-y-2">
              {notes.map((note) => (
                <li key={note.id} className="break-inside-avoid border-b border-slate-200 pb-2 text-xs last:border-0">
                  <p className="font-semibold">{note.author_name} | {new Date(note.created_at).toLocaleString()}</p>
                  <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="mt-6 border-t border-slate-400 pt-3 text-[10px] leading-relaxed text-slate-600">
          Report generated on {generatedAt.toLocaleString()} by {investigator} via AI-Based Digital Forensics Case Tracker
        </footer>
      </article>
    </div>
  );
};