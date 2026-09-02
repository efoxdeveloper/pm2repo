import PropTypes from 'prop-types';
import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import CircularProgress from '@mui/material/CircularProgress';
import { usePm2 } from 'contexts/Pm2Context';

export default function ApplicationActionButtons({ application }) {
  const { performAction, pendingActions } = usePm2();
  const [action, setAction] = useState(null);
  const label = action === 'stop' ? 'Stop Application' : action === 'restart' ? 'Restart' : 'Reload';
  const pendingAction = pendingActions[application.id];
  const isPending = Boolean(pendingAction);
  return (
    <>
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="contained" disabled={isPending} startIcon={pendingAction === 'restart' ? <CircularProgress size={14} color="inherit" /> : null} onClick={() => setAction('restart')}>{pendingAction === 'restart' ? 'Restarting...' : 'Restart'}</Button>
        <Button size="small" variant="outlined" disabled={isPending} startIcon={pendingAction === 'reload' ? <CircularProgress size={14} color="inherit" /> : null} onClick={() => setAction('reload')}>{pendingAction === 'reload' ? 'Reloading...' : 'Reload'}</Button>
        <Button size="small" color="error" variant="outlined" disabled={isPending} startIcon={pendingAction === 'stop' ? <CircularProgress size={14} color="inherit" /> : null} onClick={() => setAction('stop')}>{pendingAction === 'stop' ? 'Stopping...' : 'Stop'}</Button>
      </Stack>
      <Dialog open={Boolean(action)} onClose={() => setAction(null)}>
        <DialogTitle>{label} {application.displayName}?</DialogTitle>
        <DialogContent><DialogContentText>Are you sure you want to {action} {application.displayName}?</DialogContentText></DialogContent>
        <DialogActions><Button disabled={isPending} onClick={() => setAction(null)}>Cancel</Button><Button disabled={isPending} color={action === 'stop' ? 'error' : 'primary'} startIcon={isPending ? <CircularProgress size={14} color="inherit" /> : null} onClick={async () => { await performAction(application.id, action); setAction(null); }}>{isPending ? `${label}ing...` : label}</Button></DialogActions>
      </Dialog>
    </>
  );
}

ApplicationActionButtons.propTypes = { application: PropTypes.object };
