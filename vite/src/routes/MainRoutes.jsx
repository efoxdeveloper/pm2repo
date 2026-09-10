import { lazy } from 'react';

// project imports
import Loadable from 'components/Loadable';
import DashboardLayout from 'layout/Dashboard';
import RequireAuth from 'components/RequireAuth';

// render- Dashboard
const DashboardDefault = Loadable(lazy(() => import('pages/dashboard/default')));
const Applications = Loadable(lazy(() => import('pages/applications')));
const ApplicationDetails = Loadable(lazy(() => import('pages/applications/details')));
const AddApplication = Loadable(lazy(() => import('pages/applications/new')));
const Logs = Loadable(lazy(() => import('pages/logs')));
const Server = Loadable(lazy(() => import('pages/server')));
const Activity = Loadable(lazy(() => import('pages/activity')));
const Settings = Loadable(lazy(() => import('pages/settings')));
const Domains = Loadable(lazy(() => import('pages/domains')));
const DomainDashboard = Loadable(lazy(() => import('pages/domain-dashboard')));
const Access = Loadable(lazy(() => import('pages/access')));

// ==============================|| MAIN ROUTING ||============================== //

const MainRoutes = {
  path: '/',
  element: <RequireAuth><DashboardLayout /></RequireAuth>,
  children: [
    {
      path: '/',
      element: <DashboardDefault />
    },
    {
      path: 'dashboard',
      element: <DashboardDefault />
    },
    {
      path: 'applications',
      children: [
        { index: true, element: <Applications /> },
        { path: 'new', element: <AddApplication /> },
        { path: ':id', element: <ApplicationDetails /> }
      ]
    },
    { path: 'logs', element: <Logs /> },
    { path: 'server', element: <Server /> },
    { path: 'activity', element: <Activity /> },
    { path: 'settings', element: <Settings /> },
    { path: 'domain-dashboard', element: <DomainDashboard /> },
    { path: 'domains', element: <Domains /> },
    { path: 'access', element: <Access /> },
    {
      path: 'dashboard/default',
      element: <DashboardDefault />
    }
  ]
};

export default MainRoutes;
