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
import CircularProgress from '@mui/material/CircularProgress';
import { usePm2 } from 'contexts/Pm2Context';

const destructive = { stop: 'Stop Application', restart: 'Restart', deploy: 'Deploy', delete: 'Delete' };

export default function ApplicationActionsMenu({ application }) {
  const navigate = useNavigate();
  const { performAction, deleteApplication, deploy, pendingActions } = usePm2();
  const [anchorEl, setAnchorEl] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const closeMenu = () => setAnchorEl(null);
  const run = (action) => {
    closeMenu();
    if (destructive[action]) setConfirmAction(action);
    else performAction(application.id, action);
  };
  const confirm = async () => {
    if (confirmAction === 'delete') {
      deleteApplication(application.id);
      navigate('/applications');
    } else if (confirmAction === 'deploy') await deploy(application.id);
    else await performAction(application.id, confirmAction);
    setConfirmAction(null);
  };
  const actionLabel = confirmAction === 'delete' ? 'Delete' : confirmAction === 'stop' ? 'Stop Application' : confirmAction === 'deploy' ? 'Deploy' : 'Restart';
  const isPending = Boolean(pendingActions[application.id]);
  const message = confirmAction === 'delete'
    ? `Remove ${application.displayName} from PM2? This action will remove the application from the PM2 process list.`
    : `${actionLabel} ${application.displayName}?`;

  return (
    <>
      <IconButton size="small" disabled={isPending} aria-label={`Actions for ${application.displayName}`} onClick={(event) => setAnchorEl(event.currentTarget)}>
        {isPending ? <CircularProgress size={16} /> : <EllipsisOutlined />}
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem disabled={isPending} onClick={() => { closeMenu(); navigate(`/applications/${application.id}`); }}>View Details</MenuItem>
        <MenuItem disabled={isPending} onClick={() => { closeMenu(); navigate(`/applications/${application.id}?tab=logs`); }}>View Logs</MenuItem>
        <MenuItem disabled={isPending} onClick={() => run('restart')}>Restart</MenuItem>
        <MenuItem disabled={isPending} onClick={() => run('reload')}>Reload</MenuItem>
        {application.status === 'stopped' ? <MenuItem disabled={isPending} onClick={() => run('start')}>Start</MenuItem> : <MenuItem disabled={isPending} onClick={() => run('stop')}>Stop</MenuItem>}
        <MenuItem disabled={isPending} onClick={() => run('deploy')}>Deploy</MenuItem>
        <MenuItem disabled={isPending} onClick={() => run('delete')}>Delete</MenuItem>
      </Menu>
      <Dialog open={Boolean(confirmAction)} onClose={() => setConfirmAction(null)} aria-labelledby="confirm-action-title">
        <DialogTitle id="confirm-action-title">{actionLabel} Application</DialogTitle>
        <DialogContent><DialogContentText>{confirmAction === 'deploy' ? `Pull the latest changes, run the application build, and reload ${application.displayName} in PM2?` : message}</DialogContentText></DialogContent>
        <DialogActions><Button disabled={isPending} onClick={() => setConfirmAction(null)}>Cancel</Button><Button disabled={isPending} color={confirmAction === 'delete' || confirmAction === 'stop' ? 'error' : 'primary'} startIcon={isPending ? <CircularProgress size={14} color="inherit" /> : null} onClick={confirm}>{isPending ? 'Processing...' : actionLabel}</Button></DialogActions>
      </Dialog>
    </>
  );
}

ApplicationActionsMenu.propTypes = { application: PropTypes.object };
