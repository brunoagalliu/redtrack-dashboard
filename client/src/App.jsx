import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import CampaignListPage from './pages/CampaignListPage';
import CampaignCreatePage from './pages/CampaignCreatePage';
import CampaignEditPage from './pages/CampaignEditPage';
import CampaignDetailPage from './pages/CampaignDetailPage';

function Sidebar() {
  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  return (
    <aside className="w-56 shrink-0 bg-white border-r border-gray-200 min-h-screen px-4 py-6">
      <div className="mb-8">
        <span className="text-lg font-bold text-blue-600">Redtrack</span>
        <span className="text-lg font-light text-gray-500"> Dashboard</span>
      </div>
      <nav className="space-y-1">
        <NavLink to="/campaigns" className={linkClass}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Campaigns
        </NavLink>
      </nav>
    </aside>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-h-screen">
          <Routes>
            <Route path="/" element={<Navigate to="/campaigns" replace />} />
            <Route path="/campaigns" element={<CampaignListPage />} />
            <Route path="/campaigns/new" element={<CampaignCreatePage />} />
            <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
            <Route path="/campaigns/:id/edit" element={<CampaignEditPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
