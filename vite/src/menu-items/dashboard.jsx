// assets
import {
  AppstoreOutlined,
  BarChartOutlined,
  DashboardOutlined,
  FileTextOutlined,
  HddOutlined,
  GlobalOutlined,
  TeamOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UserAddOutlined
} from '@ant-design/icons';

// icons
const icons = {
  DashboardOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  UserAddOutlined,
  FileTextOutlined,
  HddOutlined,
  GlobalOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  SettingOutlined
};

// ==============================|| MENU ITEMS - DASHBOARD ||============================== //

const dashboard = {
  id: 'group-dashboard',
  title: 'Navigation',
  type: 'group',
  children: [
    {
      id: 'dashboard',
      title: 'Dashboard',
      type: 'item',
      url: '/dashboard',
      icon: icons.DashboardOutlined,
      breadcrumbs: false,
      permission: 'dashboard.view'
    },
    {
      id: 'website-hosting',
      title: 'Website & Hosting',
      type: 'collapse',
      icon: icons.GlobalOutlined,
      breadcrumbs: false,
      permissionAny: ['domain-dashboard.view', 'domains.view'],
      children: [
        { id: 'domain-dashboard', title: 'Overview', type: 'item', url: '/domain-dashboard', icon: icons.BarChartOutlined, permission: 'domain-dashboard.view', breadcrumbs: false },
        { id: 'domains', title: 'Domains', type: 'item', url: '/domains', icon: icons.GlobalOutlined, permission: 'domains.view', breadcrumbs: false },
        { id: 'ssl-certificates', title: 'SSL Certificates', type: 'item', url: '/ssl', icon: icons.GlobalOutlined, permission: 'domains.view', breadcrumbs: false },
        { id: 'webspace', title: 'Webspace', type: 'item', url: '/webspace', icon: icons.HddOutlined, permission: 'domains.view', breadcrumbs: false }
      ]
    },
    {
      id: 'applications',
      title: 'Applications',
      type: 'item',
      url: '/applications',
      icon: icons.AppstoreOutlined,
      permission: 'applications.view'
    },
    {
      id: 'logs',
      title: 'Logs',
      type: 'item',
      url: '/logs',
      icon: icons.FileTextOutlined,
      permission: 'logs.view'
    },
    {
      id: 'server',
      title: 'Server',
      type: 'item',
      url: '/server',
      icon: icons.HddOutlined,
      permission: 'server.view'
    },
    {
      id: 'access',
      title: 'Access',
      type: 'item',
      url: '/access',
      icon: icons.TeamOutlined,
      permissionAny: ['users.manage', 'roles.manage']
    },
    {
      id: 'activity',
      title: 'Activity',
      type: 'item',
      url: '/activity',
      icon: icons.ThunderboltOutlined,
      permission: 'activity.view'
    },
    {
      id: 'settings',
      title: 'Settings',
      type: 'item',
      url: '/settings',
      icon: icons.SettingOutlined,
      permission: 'settings.view'
    }
  ]
};

export default dashboard;
