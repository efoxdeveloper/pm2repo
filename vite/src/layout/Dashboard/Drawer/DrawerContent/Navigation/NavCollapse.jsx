import { useState } from 'react';
import PropTypes from 'prop-types';
import { useLocation, useNavigate } from 'react-router-dom';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import { useGetMenuMaster } from 'api/menu';
import NavItem from './NavItem';

export default function NavCollapse({ item }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { menuMaster } = useGetMenuMaster();
  const drawerOpen = menuMaster.isDashboardDrawerOpened;
  const activeChild = item.children?.some((child) => pathname.startsWith(child.url));
  const [open, setOpen] = useState(Boolean(activeChild));
  const Icon = item.icon;

  return (
    <Box>
      <ListItemButton
        selected={activeChild}
        onClick={() => { if (!drawerOpen && item.children?.[0]?.url) navigate(item.children[0].url); else setOpen((current) => !current); }}
        sx={{
          pl: drawerOpen ? 3 : 1.5,
          py: 1,
          '&:hover': { bgcolor: 'primary.lighter' },
          '&.Mui-selected': { bgcolor: 'primary.lighter', color: 'primary.main' }
        }}
      >
        <ListItemIcon sx={{ minWidth: 28, color: activeChild ? 'primary.main' : 'text.primary' }}><Icon style={{ fontSize: drawerOpen ? '1rem' : '1.25rem' }} /></ListItemIcon>
        {drawerOpen && <ListItemText primary={<Typography variant="h6">{item.title}</Typography>} />}
        {drawerOpen && (open ? <DownOutlined style={{ fontSize: 11 }} /> : <RightOutlined style={{ fontSize: 11 }} />)}
      </ListItemButton>
      <Collapse in={open && drawerOpen} timeout="auto" unmountOnExit>
        <List disablePadding>{item.children?.map((child) => <NavItem key={child.id} item={child} level={2} />)}</List>
      </Collapse>
    </Box>
  );
}

NavCollapse.propTypes = { item: PropTypes.object };
