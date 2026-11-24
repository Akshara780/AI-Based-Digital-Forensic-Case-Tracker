import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, ClipboardList, FileText, Plus, ShieldAlert } from 'lucide-react';
import { listCases } from '../services/caseService';
import { supabase } from '../services/supabaseClient';
import { Case, CaseTimelineEvent } from '../types/case';
import { Evidence } from '../types/evidence';

interface DashboardAlert {
  event: CaseTimelineEvent;
  caseData: Case;
}

export const Dashboard: React.FC = () => {
  const [cases, setCases] = useState<Case[]>([]);
  const [recentEvidence, setRecentEvidence] = useState<Evidence[]>([]);
  const [evidenceAddedToday, setEvidenceAddedToday] = useState<number>(0);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      try {
        const [casesResult, recentEvidenceResult, todayCountResult, timelineResult] = await Promise.all([
          listCases(),
          supabase.from('evidence').select('*').order('created_at', { ascending: false }).limit(5),
          supabase.from('evidence').select('id', { count: 'exact', head: true })
            .gte('created_at', todayStart.toISOString())
            .lt('created_at', tomorrowStart.toISOString()),
          supabase.from('case_timeline').select('*')
            .gte('timestamp', sevenDaysAgo.toISOString())
            .in('event', ['AI Detected Related Evidence', 'AI Reprioritization'])
            .order('timestamp', { ascending: false })
            .limit(10),
        ]);

        if (!isMounted) return;

        setCases(casesResult.data);
        setRecentEvidence((recentEvidenceResult.data as Evidence[] | null) || []);
        setEvidenceAddedToday(todayCountResult.count || 0);

        const casesById = new Map(casesResult.data.map((caseItem) => [caseItem.id, caseItem]));
        const timelineRows = (timelineResult.data as CaseTimelineEvent[] | null) || [];
        setAlerts(timelineRows.flatMap((event) => {
          const caseData = casesById.get(event.case_id);
          return caseData ? [{ event, caseData }] : [];
        }));

        const queryError = casesResult.error || recentEvidenceResult.error?.message || todayCountResult.error?.message || timelineResult.error?.message;
        setError(queryError || null);
      } catch (loadError) {
        if (isMounted) setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard data.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadDashboard();
    return () => { isMounted = false; };
  }, []);

  // These counts are simple database facts, not learned or predictive values.
  const openCases = cases.filter((caseItem) => caseItem.status === 'OPEN').length;
  const investigatingCases = cases.filter((caseItem) => caseItem.status === 'UNDER_INVESTIGATION').length;
  const highPriorityCases = cases.filter((caseItem) => caseItem.priority === 'HIGH' || caseItem.priority === 'CRITICAL').length;
  const casesNeedingReview = cases.filter((caseItem) => caseItem.status === 'REVIEW');

  const metrics = [
    { label: 'Total Cases', value: cases.length, icon: ClipboardList, color: 'text-cyan-300' },
    { label: 'Open Cases', value: openCases, icon: FileText, color: 'text-sky-300' },
    { label: 'Under Investigation', value: investigatingCases, icon: Activity, color: 'text-amber-300' },
    { label: 'High Priority Cases', value: highPriorityCases, icon: ShieldAlert, color: 'text-rose-300' },
    { label: 'Evidence Added Today', value: evidenceAddedToday, icon: Plus, color: 'text-emerald-300' },
  ];

  const formatPriority = (value?: string) => value ? `${value[0]}${value.slice(1).toLowerCase()}` : 'Unknown';

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-8 lg:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400">Forensics operations</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">Dashboard</h1>
        </div>
        <Link to="/cases" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-cyan-700 hover:text-cyan-300">
          <FileText className="h-4 w-4" /> Browse Cases
        </Link>
      </div>

      {error && <p role="alert" className="mb-5 rounded-lg border border-rose-800/70 bg-rose-950/30 px-4 py-3 text-xs text-rose-300">Some dashboard data could not be loaded: {error}</p>}

      <section className="mb-8 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800 sm:grid-cols-2 xl:grid-cols-5" aria-label="Case and evidence totals">
        {metrics.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-slate-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">{label}</span>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-100">{loading ? '—' : value}</div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="border-t border-slate-800 pt-5" aria-label="Recently added evidence">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Recently Added Evidence</h2>
            <span className="text-[11px] text-slate-500">Latest 5</span>
          </div>
          {loading ? <p className="text-xs text-slate-400">Loading evidence...</p> : recentEvidence.length === 0 ? (
            <p className="text-xs text-slate-400">No evidence has been added yet.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {recentEvidence.map((item) => {
                const caseData = cases.find((caseItem) => caseItem.id === item.case_id);
                return (
                  <li key={item.id} className="py-3 first:pt-0">
                    <Link to={`/cases/${item.case_id}`} className="group flex items-start justify-between gap-4">
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-slate-200 group-hover:text-cyan-300">{item.title}</span>
                        <span className="mt-1 block truncate text-[11px] text-slate-500">{caseData ? `${caseData.case_number} · ${caseData.title}` : 'Case details unavailable'} · {item.evidence_type}</span>
                      </span>
                      <time className="shrink-0 text-[10px] text-slate-500" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="border-t border-slate-800 pt-5" aria-label="Suggested review notices">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Suggested review notices</h2>
            <span className="text-[11px] text-slate-500">Last 7 days</span>
          </div>
          {loading ? <p className="text-xs text-slate-400">Loading alerts...</p> : alerts.length === 0 ? (
            <p className="text-xs text-slate-400">No recent review notices.</p>
          ) : (
            <ul className="space-y-3">
              {alerts.map(({ event, caseData }) => {
                const priorityChange = event.event === 'AI Reprioritization'
                  ? event.description.match(/(?:from\s+)?(LOW|MEDIUM|HIGH|CRITICAL)\s+to\s+(LOW|MEDIUM|HIGH|CRITICAL)/i)
                  : null;
                const message = priorityChange
                  ? `Case priority changed from ${formatPriority(priorityChange[1])} → ${formatPriority(priorityChange[2])}.`
                  : 'New related evidence detected.';
                return (
                  <li key={event.id}>
                    <Link to={`/cases/${caseData.id}?tab=AI%20Analysis`} className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 transition hover:border-amber-800/70">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                      <span className="min-w-0">
                        <span className="block text-xs text-slate-200">Case {caseData.case_number}: {message}</span>
                        <time className="mt-1 block text-[10px] text-slate-500" dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleString()}</time>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="border-t border-slate-800 pt-5 lg:col-span-2" aria-label="Cases needing review">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Cases Needing Review</h2>
            <span className="text-[11px] text-slate-500">{casesNeedingReview.length} cases</span>
          </div>
          {loading ? <p className="text-xs text-slate-400">Loading cases...</p> : casesNeedingReview.length === 0 ? (
            <p className="text-xs text-slate-400">No cases are currently marked for review.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {casesNeedingReview.map((caseItem) => (
                <li key={caseItem.id} className="py-3 first:pt-0">
                  <Link to={`/cases/${caseItem.id}`} className="flex items-center justify-between gap-4 text-xs hover:text-cyan-300">
                    <span className="truncate"><span className="font-mono text-cyan-400">{caseItem.case_number}</span><span className="mx-2 text-slate-600">/</span>{caseItem.title}</span>
                    <span className="shrink-0 rounded border border-amber-800/70 px-2 py-1 text-[10px] text-amber-300">{caseItem.priority}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};