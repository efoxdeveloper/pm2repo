import PropTypes from 'prop-types';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import EllipsisOutlined from '@ant-design/icons/EllipsisOutlined';
import { usePm2 } from 'contexts/Pm2Context';

const destructive = { stop: 'Stop Application', restart: 'Restart', delete: 'Delete' };

export default function ApplicationActionsMenu({ application }) {
  const navigate = useNavigate();
  const { performAction, deleteApplication } = usePm2();
  const [anchorEl, setAnchorEl] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const closeMenu = () => setAnchorEl(null);
  const run = (action) => {
    closeMenu();
    if (destructive[action]) setConfirmAction(action);
    else performAction(application.id, action);
  };
  const confirm = () => {
    if (confirmAction === 'delete') {
      deleteApplication(application.id);
      navigate('/applications');
    } else performAction(application.id, confirmAction);
    setConfirmAction(null);
  };
  const actionLabel = confirmAction === 'delete' ? 'Delete' : confirmAction === 'stop' ? 'Stop Application' : 'Restart';
  const message = confirmAction === 'delete'
    ? `Remove ${application.displayName} from PM2? This action will remove the application from the PM2 process list.`
    : `${actionLabel} ${application.displayName}?`;

  return (
    <>
      <IconButton size="small" aria-label={`Actions for ${application.displayName}`} onClick={(event) => setAnchorEl(event.currentTarget)}>
        <EllipsisOutlined />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem onClick={() => { closeMenu(); navigate(`/applications/${application.id}`); }}>View Details</MenuItem>
        <MenuItem onClick={() => { closeMenu(); navigate(`/applications/${application.id}?tab=logs`); }}>View Logs</MenuItem>
        <MenuItem onClick={() => run('restart')}>Restart</MenuItem>
        <MenuItem onClick={() => run('reload')}>Reload</MenuItem>
        {application.status === 'stopped' ? <MenuItem onClick={() => run('start')}>Start</MenuItem> : <MenuItem onClick={() => run('stop')}>Stop</MenuItem>}
        <MenuItem onClick={() => run('delete')}>Delete</MenuItem>
      </Menu>
      <Dialog open={Boolean(confirmAction)} onClose={() => setConfirmAction(null)} aria-labelledby="confirm-action-title">
        <DialogTitle id="confirm-action-title">{actionLabel} Application</DialogTitle>
        <DialogContent><DialogContentText>{message}</DialogContentText></DialogContent>
        <DialogActions><Button onClick={() => setConfirmAction(null)}>Cancel</Button><Button color={confirmAction === 'delete' || confirmAction === 'stop' ? 'error' : 'primary'} onClick={confirm}>{actionLabel}</Button></DialogActions>
      </Dialog>
    </>
  );
}

ApplicationActionsMenu.propTypes = { application: PropTypes.object };
