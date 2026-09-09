import PropTypes from 'prop-types';

// material-ui
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';

// assets
import LogoutOutlined from '@ant-design/icons/LogoutOutlined';
import LockOutlined from '@ant-design/icons/LockOutlined';

// ==============================|| HEADER PROFILE - PROFILE TAB ||============================== //

export default function ProfileTab({ onChangePassword, onLogout }) {
  return (
    <List component="nav" sx={{ p: 0, '& .MuiListItemIcon-root': { minWidth: 32 } }}>
      <ListItemButton onClick={onChangePassword}>
        <ListItemIcon>
          <LockOutlined />
        </ListItemIcon>
        <ListItemText primary="Change password" />
      </ListItemButton>
      <ListItemButton onClick={onLogout}>
        <ListItemIcon>
          <LogoutOutlined />
        </ListItemIcon>
        <ListItemText primary="Logout" />
      </ListItemButton>
    </List>
  );
}

ProfileTab.propTypes = { onChangePassword: PropTypes.func, onLogout: PropTypes.func };
