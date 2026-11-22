import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Navbar } from './components/Navbar';
import { Login } from './pages/Login';
import { Cases } from './pages/Cases';
import { CreateCase } from './pages/CreateCase';
import { CaseDetails } from './pages/CaseDetails';
import { AddEvidence } from './pages/AddEvidence';
import { Dashboard } from './pages/Dashboard';
import { CaseReport } from './pages/CaseReport';

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
          <Navbar />
          <main className="flex-1">
            <Routes>
              {/* Public Auth Route */}
              <Route path="/login" element={<Login />} />

              {/* Protected Routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cases"
                element={
                  <ProtectedRoute>
                    <Cases />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cases/new"
                element={
                  <ProtectedRoute>
                    <CreateCase />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cases/:id/report"
                element={
                  <ProtectedRoute>
                    <CaseReport />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cases/:id"
                element={
                  <ProtectedRoute>
                    <CaseDetails />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cases/:id/evidence/new"
                element={
                  <ProtectedRoute>
                    <AddEvidence />
                  </ProtectedRoute>
                }
              />

              {/* Fallback route */}
              <Route path="*" element={<Navigate to="/cases" replace />} />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </Router>
  );
}
