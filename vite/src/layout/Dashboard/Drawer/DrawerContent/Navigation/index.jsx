// material-ui
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

// project import
import NavGroup from './NavGroup';
import menuItem from 'menu-items';
import { useAuth } from 'contexts/AuthContext';

// ==============================|| DRAWER CONTENT - NAVIGATION ||============================== //

export default function Navigation() {
  const { hasPermission } = useAuth();
  const filterItem = (item) => {
    if (item.permission && !hasPermission(item.permission)) return null;
    if (item.permissionAny && !item.permissionAny.some((permission) => hasPermission(permission))) return null;
    if (item.children) {
      const children = item.children.map(filterItem).filter(Boolean);
      if (!children.length) return null;
      return { ...item, children };
    }
    return item;
  };
  const navGroups = menuItem.items.map(filterItem).filter(Boolean).map((item) => {
    switch (item.type) {
      case 'group':
        return <NavGroup key={item.id} item={item} />;
      default:
        return (
          <Typography key={item.id} variant="h6" sx={{ color: 'error.main', textAlign: 'center' }}>
            Fix - Navigation Group
          </Typography>
        );
    }
  });

  return <Box sx={{ pt: 2 }}>{navGroups}</Box>;
}
