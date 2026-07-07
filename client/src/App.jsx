import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useMatch } from 'react-router-dom';
import CampaignListPage from './pages/CampaignListPage';
import CampaignCreatePage from './pages/CampaignCreatePage';
import CampaignEditPage from './pages/CampaignEditPage';
import CampaignDetailPage from './pages/CampaignDetailPage';
import ReportsPage from './pages/ReportsPage';
import VerticalsPage from './pages/VerticalsPage';
import InsightsPage from './pages/InsightsPage';
import AIRecommendationsPage from './pages/AIRecommendationsPage';
import AIDashboardPage from './pages/AIDashboardPage';
import OffersPage from './pages/OffersPage';
import ListsPage from './pages/ListsPage';
import ListsAIPage from './pages/ListsAIPage';
import CostUpdaterPage from './pages/CostUpdaterPage';
import RevenueUpdaterPage from './pages/RevenueUpdaterPage';
import SyncLogsPage from './pages/SyncLogsPage';
import LoginPage from './pages/LoginPage';
import { getToken, clearToken } from './lib/api';

function RequireAuth({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

function Sidebar() {
  const inReports = useMatch('/reports/*');
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');

  function toggle() {
    setCollapsed(c => {
      localStorage.setItem('sidebar-collapsed', String(!c));
      return !c;
    });
  }

  const linkClass = ({ isActive }) =>
    `flex items-center py-2 rounded-md text-sm font-medium transition-colors ${
      collapsed ? 'px-2 justify-center' : 'gap-2 px-3'
    } ${isActive ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`;

  const subLinkClass = ({ isActive }) =>
    `flex items-center gap-2 pl-9 pr-3 py-1.5 rounded-md text-sm transition-colors ${
      isActive ? 'text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
    }`;

  function handleLogout() {
    clearToken();
    window.location.href = '/login';
  }

  return (
    <aside className={`${collapsed ? 'w-14' : 'w-56'} shrink-0 bg-white border-r border-gray-200 min-h-screen flex flex-col transition-[width] duration-200 overflow-hidden`}>
      {/* Header */}
      <div className={`flex items-center h-16 ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
        {!collapsed && (
          <div className="flex-1">
            <span className="text-lg font-bold text-blue-600">Redtrack</span>
            <span className="text-lg font-light text-gray-500"> Dashboard</span>
          </div>
        )}
        <button onClick={toggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d={collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className={`space-y-1 flex-1 pb-4 ${collapsed ? 'px-2' : 'px-4'}`}>
        <NavLink to="/campaigns" className={linkClass} title={collapsed ? 'Campaigns' : undefined}>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          {!collapsed && 'Campaigns'}
        </NavLink>

        <NavLink to="/reports/media-buyers" title={collapsed ? 'Reports' : undefined}
          className={() => `flex items-center py-2 rounded-md text-sm font-medium transition-colors ${
            collapsed ? 'px-2 justify-center' : 'gap-2 px-3'
          } ${inReports ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {!collapsed && 'Reports'}
        </NavLink>

        {!collapsed && inReports && (
          <div className="space-y-0.5">
            <NavLink to="/reports/ai" className={subLinkClass}>✦ AI</NavLink>
            <NavLink to="/reports/insights" className={subLinkClass}>Insights</NavLink>
            <NavLink to="/reports/media-buyers" className={subLinkClass}>Media Buyers</NavLink>
            <NavLink to="/reports/verticals" className={subLinkClass}>Verticals</NavLink>
            <NavLink to="/reports/offers" className={subLinkClass}>Offers</NavLink>
            <NavLink to="/reports/lists" className={subLinkClass}>Lists</NavLink>
          </div>
        )}

        <div className="pt-3">
          {!collapsed && <p className="px-3 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Tools</p>}
          <NavLink to="/tools/cost-updater" className={linkClass} title={collapsed ? 'Cost Updater' : undefined}>
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {!collapsed && 'Cost Updater'}
          </NavLink>
          <NavLink to="/tools/revenue-updater" className={linkClass} title={collapsed ? 'Revenue Updater' : undefined}>
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            {!collapsed && 'Revenue Updater'}
          </NavLink>
          <NavLink to="/tools/import-logs" className={linkClass} title={collapsed ? 'Import Logs' : undefined}>
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {!collapsed && 'Import Logs'}
          </NavLink>
        </div>
      </nav>

      {/* Sign out */}
      <div className={`pb-6 ${collapsed ? 'px-2' : 'px-4'}`}>
        <button onClick={handleLogout} title={collapsed ? 'Sign out' : undefined}
          className={`w-full flex items-center py-2 rounded-md text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors ${
            collapsed ? 'px-2 justify-center' : 'gap-2 px-3'
          }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
}

function AppLayout() {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 min-h-screen min-w-0 overflow-x-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/campaigns" replace />} />
          <Route path="/campaigns" element={<CampaignListPage />} />
          <Route path="/campaigns/new" element={<CampaignCreatePage />} />
          <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
          <Route path="/campaigns/:id/edit" element={<CampaignEditPage />} />
          <Route path="/reports" element={<Navigate to="/reports/ai" replace />} />
          <Route path="/reports/ai" element={<AIDashboardPage />} />
          <Route path="/reports/insights" element={<InsightsPage />} />
          <Route path="/reports/media-buyers" element={<ReportsPage />} />
          <Route path="/reports/verticals" element={<VerticalsPage />} />
          <Route path="/reports/offers" element={<OffersPage />} />
          <Route path="/reports/lists" element={<ListsPage />} />
          <Route path="/tools/cost-updater" element={<CostUpdaterPage />} />
          <Route path="/tools/revenue-updater" element={<RevenueUpdaterPage />} />
          <Route path="/tools/import-logs" element={<SyncLogsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<RequireAuth><AppLayout /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  );
}
