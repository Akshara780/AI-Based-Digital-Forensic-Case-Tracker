import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, LogOut, FileText, LayoutDashboard } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, profile, role, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  if (!user) return null;

  // Role badge styling
  const getRoleBadgeStyle = (r: string) => {
    switch (r) {
      case 'ADMIN':
        return 'bg-purple-950 text-purple-300 border-purple-800';
      case 'INVESTIGATOR':
        return 'bg-cyan-950 text-cyan-300 border-cyan-800';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50 px-4 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Brand Logo & Title */}
        <Link to="/" className="flex items-center space-x-3 text-cyan-400 font-bold text-lg hover:opacity-90">
          <Shield className="w-6 h-6 text-cyan-400" />
          <span>Forensics Case Tracker</span>
        </Link>

        {/* Navigation Links */}
        <div className="flex items-center space-x-6">
          <Link
            to="/"
            className="flex items-center space-x-2 text-sm text-slate-300 hover:text-cyan-400 transition"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>
          <Link
            to="/cases"
            className="flex items-center space-x-2 text-sm text-slate-300 hover:text-cyan-400 transition"
          >
            <FileText className="w-4 h-4" />
            <span>Cases</span>
          </Link>

          {/* User Profile & Role Info */}
          <div className="flex items-center space-x-3 pl-4 border-l border-slate-800">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-medium text-slate-200">{profile?.full_name || user.email}</div>
              <div className="text-[10px] text-slate-400">{user.email}</div>
            </div>

            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${getRoleBadgeStyle(
                role
              )}`}
            >
              {role}
            </span>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1.5 text-xs text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-950/80 px-3 py-1.5 rounded-lg border border-rose-900/50 transition"
              title="Log out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};
