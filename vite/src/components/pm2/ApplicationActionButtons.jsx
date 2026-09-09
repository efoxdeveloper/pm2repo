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
  const { performAction, deploy, runGitPull, runBuild, runNpmInstall, pendingActions } = usePm2();
  const [action, setAction] = useState(null);
  const label = action === 'stop' ? 'Stop Application' : action === 'restart' ? 'Restart' : action === 'deploy' ? 'Deploy' : action === 'git-pull' ? 'Git Pull Origin' : action === 'npm-install' ? 'npm i' : 'Build';
  const pendingAction = pendingActions[application.id];
  const isPending = Boolean(pendingAction);
  const pendingLabel = pendingAction === 'restart' ? 'Restarting...' : pendingAction === 'stop' ? 'Stopping...' : pendingAction === 'git-pull' ? 'Pulling...' : pendingAction === 'build' ? 'Building...' : pendingAction === 'npm-install' ? 'Installing...' : 'Deploying...';
  return (
    <>
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="contained" disabled={isPending} startIcon={pendingAction === 'restart' ? <CircularProgress size={14} color="inherit" /> : null} onClick={() => setAction('restart')}>{pendingAction === 'restart' ? 'Restarting...' : 'Restart'}</Button>
        <Button size="small" color="error" variant="outlined" disabled={isPending} startIcon={pendingAction === 'stop' ? <CircularProgress size={14} color="inherit" /> : null} onClick={() => setAction('stop')}>{pendingAction === 'stop' ? 'Stopping...' : 'Stop'}</Button>
        <Button size="small" variant="outlined" disabled={isPending} startIcon={pendingAction === 'git-pull' ? <CircularProgress size={14} color="inherit" /> : null} onClick={() => setAction('git-pull')}>{pendingAction === 'git-pull' ? 'Pulling...' : 'Git Pull Origin'}</Button>
        <Button size="small" variant="outlined" disabled={isPending} startIcon={pendingAction === 'build' ? <CircularProgress size={14} color="inherit" /> : null} onClick={() => setAction('build')}>{pendingAction === 'build' ? 'Building...' : 'Build'}</Button>
        <Button size="small" variant="outlined" disabled={isPending} startIcon={pendingAction === 'npm-install' ? <CircularProgress size={14} color="inherit" /> : null} onClick={() => setAction('npm-install')}>{pendingAction === 'npm-install' ? 'Installing...' : 'npm i'}</Button>
        <Button size="small" variant="outlined" disabled={isPending} startIcon={pendingAction === 'deploy' ? <CircularProgress size={14} color="inherit" /> : null} onClick={() => setAction('deploy')}>{pendingAction === 'deploy' ? 'Deploying...' : 'Deploy'}</Button>
      </Stack>
      <Dialog open={Boolean(action)} onClose={() => setAction(null)}>
        <DialogTitle>{label} {application.displayName}?</DialogTitle>
        <DialogContent><DialogContentText>{action === 'deploy' ? `Pull the latest changes, run the application build, and reload ${application.displayName} in PM2?` : action === 'git-pull' ? `Run git pull from origin in ${application.displayName}?` : action === 'build' ? `Run the detected build command for ${application.displayName}?` : action === 'npm-install' ? `Run npm i in ${application.cwd} to install the application dependencies?` : `Are you sure you want to ${action} ${application.displayName}?`}</DialogContentText></DialogContent>
        <DialogActions><Button disabled={isPending} onClick={() => setAction(null)}>Cancel</Button><Button disabled={isPending} color={action === 'stop' ? 'error' : 'primary'} startIcon={isPending ? <CircularProgress size={14} color="inherit" /> : null} onClick={async () => { if (action === 'deploy') await deploy(application.id); else if (action === 'git-pull') await runGitPull(application.id); else if (action === 'build') await runBuild(application.id); else if (action === 'npm-install') await runNpmInstall(application.id); else await performAction(application.id, action); setAction(null); }}>{isPending ? pendingLabel : label}</Button></DialogActions>
      </Dialog>
    </>
  );
}

ApplicationActionButtons.propTypes = { application: PropTypes.object };
