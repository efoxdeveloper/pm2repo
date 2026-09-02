import PropTypes from 'prop-types';
import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import { usePm2 } from 'contexts/Pm2Context';

export default function ApplicationActionButtons({ application }) {
  const { performAction } = usePm2();
  const [action, setAction] = useState(null);
  const label = action === 'stop' ? 'Stop Application' : action === 'restart' ? 'Restart' : 'Reload';
  return (
    <>
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="contained" onClick={() => setAction('restart')}>Restart</Button>
        <Button size="small" variant="outlined" onClick={() => setAction('reload')}>Reload</Button>
        <Button size="small" color="error" variant="outlined" onClick={() => setAction('stop')}>Stop</Button>
      </Stack>
      <Dialog open={Boolean(action)} onClose={() => setAction(null)}>
        <DialogTitle>{label} {application.displayName}?</DialogTitle>
        <DialogContent><DialogContentText>Are you sure you want to {action} {application.displayName}?</DialogContentText></DialogContent>
        <DialogActions><Button onClick={() => setAction(null)}>Cancel</Button><Button color={action === 'stop' ? 'error' : 'primary'} onClick={() => { performAction(application.id, action); setAction(null); }}>{label}</Button></DialogActions>
      </Dialog>
    </>
  );
}

ApplicationActionButtons.propTypes = { application: PropTypes.object };
