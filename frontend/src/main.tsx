import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App' // Back to React Flow - it actually worked
import TestReactHeavy from './TestReactHeavy'
import TestReactFlow from './TestReactFlow'
import MetricsDashboard from './pages/MetricsDashboard'
import LeaderboardDashboard from './pages/LeaderboardDashboard'
import IndexPage from './pages/IndexPage'
import ServerListPage from './pages/ServerListPage'
import XpubHistoryPage from './pages/XpubHistoryPage'
import './index.css'

// Check URL to decide which component to render
const path = window.location.pathname;
const isTestHeavy = path === '/test-heavy';
const isTestFlow = path === '/test-flow';
const isMetrics = path === '/metrics';
const isLeaderboard = path === '/leaderboard';
const isIndex = path === '/index';
const isServerList = path === '/servers';
const isXpubHistory = path === '/xpub-history';

let ComponentToRender = App;
if (isTestHeavy) ComponentToRender = TestReactHeavy;
if (isTestFlow) ComponentToRender = TestReactFlow;
if (isMetrics) ComponentToRender = MetricsDashboard;
if (isLeaderboard) ComponentToRender = LeaderboardDashboard;
if (isIndex) ComponentToRender = IndexPage;
if (isServerList) ComponentToRender = ServerListPage;
if (isXpubHistory) ComponentToRender = XpubHistoryPage;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ComponentToRender />
  </React.StrictMode>,
)

