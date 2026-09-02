// assets
import {
  AppstoreOutlined,
  DashboardOutlined,
  FileTextOutlined,
  HddOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UserAddOutlined
} from '@ant-design/icons';

// icons
const icons = {
  DashboardOutlined,
  AppstoreOutlined,
  UserAddOutlined,
  FileTextOutlined,
  HddOutlined,
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
      breadcrumbs: false
    },
    {
      id: 'applications',
      title: 'Applications',
      type: 'collapse',
      url: '/applications',
      icon: icons.AppstoreOutlined,
      children: [
        { id: 'all-applications', title: 'All Applications', type: 'item', url: '/applications', icon: icons.AppstoreOutlined },
        { id: 'add-application', title: 'Add Application', type: 'item', url: '/applications/new', icon: icons.UserAddOutlined }
      ]
    },
    {
      id: 'logs',
      title: 'Logs',
      type: 'item',
      url: '/logs',
      icon: icons.FileTextOutlined
    },
    {
      id: 'server',
      title: 'Server',
      type: 'item',
      url: '/server',
      icon: icons.HddOutlined
    },
    {
      id: 'activity',
      title: 'Activity',
      type: 'item',
      url: '/activity',
      icon: icons.ThunderboltOutlined
    },
    {
      id: 'settings',
      title: 'Settings',
      type: 'item',
      url: '/settings',
      icon: icons.SettingOutlined
    }
  ]
};

export default dashboard;
