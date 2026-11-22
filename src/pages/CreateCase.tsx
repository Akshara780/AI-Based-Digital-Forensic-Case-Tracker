import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createCase, generateCaseNumber } from '../services/caseService';
import { CaseType, Priority, CaseStatus } from '../types/case';
import { useAuth } from '../context/AuthContext';
import { FolderPlus, ArrowLeft, AlertCircle } from 'lucide-react';

export const CreateCase: React.FC = () => {
  const { user, profile, role } = useAuth();
  const navigate = useNavigate();

  const [caseNumber, setCaseNumber] = useState('');
  const [title, setTitle] = useState('');
  const [caseType, setCaseType] = useState<CaseType>('Unauthorized Account Access');
  const [description, setDescription] = useState('');
  const [dateReported, setDateReported] = useState(new Date().toISOString().slice(0, 16));
  const [priority, setPriority] = useState<Priority>('LOW');
  const [status, setStatus] = useState<CaseStatus>('OPEN');
  const [investigator, setInvestigator] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    generateCaseNumber()
      .then((num) => setCaseNumber(num))
      .catch((numberError: unknown) => {
        setError(numberError instanceof Error ? numberError.message : 'Could not load the next case number.');
      });
    if (profile?.full_name || user?.email) {
      setInvestigator(profile?.full_name || user?.email || '');
    }
  }, [profile, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: createError } = await createCase({
      case_number: caseNumber,
      title,
      case_type: caseType,
      description,
      date_reported: dateReported,
      priority,
      status,
      investigator,
    });

    setLoading(false);

    if (createError) {
      setError(createError);
    } else if (data) {
      navigate(`/cases/${data.id}`);
    }
  };

  // Role rule check
  if (role === 'VIEWER') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-slate-400">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-200">Access Denied</h2>
        <p className="text-xs text-slate-400 mt-1 mb-4">
          Viewer accounts do not have permission to create new cases.
        </p>
        <Link to="/cases" className="text-xs text-cyan-400 underline">
          Return to cases
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Back button */}
      <Link
        to="/cases"
        className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-cyan-400 mb-6 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Cases</span>
      </Link>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
        <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-slate-800">
          <div className="p-2 bg-cyan-950/60 border border-cyan-800 rounded-lg">
            <FolderPlus className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Create New Forensic Case</h1>
            <p className="text-xs text-slate-400">Initialize a case file for digital forensic analysis.</p>
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
            {/* Case Number */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Case Number Preview
              </label>
              <input
                type="text"
                required
                readOnly
                value={caseNumber}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-cyan-400 font-mono focus:outline-none focus:border-cyan-500"
              />
              <p className="mt-1 text-[10px] text-slate-500">The final sequential number is assigned when the case is saved.</p>
            </div>

            {/* Case Type Dropdown */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Case Type
              </label>
              <select
                value={caseType}
                onChange={(e) => setCaseType(e.target.value as CaseType)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="Unauthorized Account Access">Unauthorized Account Access</option>
                <option value="Phishing">Phishing</option>
                <option value="Cyberbullying">Cyberbullying</option>
                <option value="Data Theft">Data Theft</option>
                <option value="Suspicious Activity">Suspicious Activity</option>
                <option value="Device Misuse">Device Misuse</option>
                <option value="Online Fraud">Online Fraud</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Case Title */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Case Title
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Unauthorized Login Attempt on Admin Portal"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Case Description */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Description & Context
            </label>
            <textarea
              rows={3}
              placeholder="Provide background details, affected systems, initial observations..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Priority */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Initial Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Initial Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as CaseStatus)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="OPEN">OPEN</option>
                <option value="UNDER_INVESTIGATION">UNDER INVESTIGATION</option>
                <option value="ANALYSIS">ANALYSIS</option>
              </select>
            </div>

            {/* Date Reported */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Date Reported
              </label>
              <input
                type="datetime-local"
                value={dateReported}
                onChange={(e) => setDateReported(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Lead Investigator */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Lead Investigator
            </label>
            <input
              type="text"
              required
              value={investigator}
              onChange={(e) => setInvestigator(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Submit */}
          <div className="pt-4 flex justify-end space-x-3">
            <Link
              to="/cases"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 text-xs font-semibold rounded-lg shadow-lg shadow-cyan-950 transition"
            >
              {loading ? 'Creating...' : 'Save Case File'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
