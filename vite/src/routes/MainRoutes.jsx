import { lazy } from 'react';

// project imports
import Loadable from 'components/Loadable';
import DashboardLayout from 'layout/Dashboard';

// render- Dashboard
const DashboardDefault = Loadable(lazy(() => import('pages/dashboard/default')));
const Applications = Loadable(lazy(() => import('pages/applications')));
const ApplicationDetails = Loadable(lazy(() => import('pages/applications/details')));
const AddApplication = Loadable(lazy(() => import('pages/applications/new')));
const Logs = Loadable(lazy(() => import('pages/logs')));
const Server = Loadable(lazy(() => import('pages/server')));
const Activity = Loadable(lazy(() => import('pages/activity')));
const Settings = Loadable(lazy(() => import('pages/settings')));

// render - color
const Color = Loadable(lazy(() => import('pages/component-overview/color')));
const Typography = Loadable(lazy(() => import('pages/component-overview/typography')));
const Shadow = Loadable(lazy(() => import('pages/component-overview/shadows')));

// render - sample page
const SamplePage = Loadable(lazy(() => import('pages/extra-pages/sample-page')));

// ==============================|| MAIN ROUTING ||============================== //

const MainRoutes = {
  path: '/',
  element: <DashboardLayout />,
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
    {
      path: 'dashboard/default',
      element: <DashboardDefault />
    },
    {
      path: 'typography',
      element: <Typography />
    },
    {
      path: 'color',
      element: <Color />
    },
    {
      path: 'shadow',
      element: <Shadow />
    },
    {
      path: 'sample-page',
      element: <SamplePage />
    }
  ]
};

export default MainRoutes;
