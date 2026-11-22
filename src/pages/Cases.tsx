import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listCases } from '../services/caseService';
import { Case, Priority, CaseStatus } from '../types/case';
import { useAuth } from '../context/AuthContext';
import { Plus, Search, Filter, Folder, ShieldAlert, ArrowRight } from 'lucide-react';

export const Cases: React.FC = () => {
  const { role } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchCasesData = async () => {
    setLoading(true);
    const { data } = await listCases({
      status: statusFilter,
      priority: priorityFilter,
      search: searchQuery,
    });
    setCases(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchCasesData();
  }, [statusFilter, priorityFilter, searchQuery]);

  // Priority color badges
  const getPriorityBadge = (priority: Priority) => {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-rose-950/80 text-rose-300 border-rose-800';
      case 'HIGH':
        return 'bg-amber-950/80 text-amber-300 border-amber-800';
      case 'MEDIUM':
        return 'bg-yellow-950/80 text-yellow-300 border-yellow-800';
      default:
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
    }
  };

  // Status color badges
  const getStatusBadge = (status: CaseStatus) => {
    switch (status) {
      case 'OPEN':
        return 'bg-blue-950 text-blue-300 border-blue-800';
      case 'UNDER_INVESTIGATION':
      case 'ANALYSIS':
        return 'bg-purple-950 text-purple-300 border-purple-800';
      case 'RESOLVED':
      case 'CLOSED':
        return 'bg-slate-800 text-slate-300 border-slate-700';
      default:
        return 'bg-cyan-950 text-cyan-300 border-cyan-800';
    }
  };

  const canWrite = role === 'INVESTIGATOR' || role === 'ADMIN';

  return (
    <div className="max-w-screen-2xl mx-auto px-4 lg:px-8 py-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center space-x-2">
            <Folder className="w-6 h-6 text-cyan-400" />
            <span>Forensics Cases</span>
          </h1>
          <p className="text-slate-400 text-xs mt-1">
            Manage active investigations, evidence files, and case records.
          </p>
        </div>

        {/* Role Rule: VIEWER cannot see Create Case button */}
        {canWrite && (
          <Link
            to="/cases/new"
            className="flex items-center space-x-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs rounded-lg shadow-lg shadow-cyan-950 transition self-start md:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Create Case</span>
          </Link>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by case #, title..."
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center space-x-2 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter by:</span>
          </div>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 px-3 py-2 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">OPEN</option>
            <option value="UNDER_INVESTIGATION">UNDER INVESTIGATION</option>
            <option value="EVIDENCE_ADDED">EVIDENCE ADDED</option>
            <option value="ANALYSIS">ANALYSIS</option>
            <option value="REVIEW">REVIEW</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="CLOSED">CLOSED</option>
          </select>

          {/* Priority Dropdown */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 px-3 py-2 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
        </div>
      </div>

      {/* Case List Grid */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-xs">
          Loading case records...
        </div>
      ) : cases.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
          <ShieldAlert className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-medium">No cases found</p>
          <p className="text-xs text-slate-500 mt-1">
            Try adjusting your search query or status filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cases.map((c) => (
            <div
              key={c.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-5 flex flex-col justify-between transition group shadow-md"
            >
              <div>
                {/* Header info */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="font-mono text-xs text-cyan-400 font-bold bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-900/60">
                    {c.case_number}
                  </span>

                  <div className="flex items-center space-x-1.5">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getPriorityBadge(
                        c.priority
                      )}`}
                    >
                      {c.priority}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getStatusBadge(
                        c.status
                      )}`}
                    >
                      {c.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* Title & Description */}
                <h2 className="text-sm font-semibold text-slate-100 group-hover:text-cyan-400 transition line-clamp-1 mb-1">
                  {c.title}
                </h2>
                <p className="text-xs text-slate-400 line-clamp-2 mb-4">
                  {c.description || 'No description provided.'}
                </p>
              </div>

              {/* Footer info & Link */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>{c.case_type}</span>
                <Link
                  to={`/cases/${c.id}`}
                  className="flex items-center space-x-1 text-cyan-400 hover:text-cyan-300 font-medium text-xs"
                >
                  <span>Open Case</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
