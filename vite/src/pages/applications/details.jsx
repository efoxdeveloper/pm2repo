import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import MainCard from 'components/MainCard';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import ApplicationStatusChip from 'components/pm2/ApplicationStatusChip';
import ApplicationActionsMenu from 'components/pm2/ApplicationActionsMenu';
import ApplicationActionButtons from 'components/pm2/ApplicationActionButtons';
import FieldGrid from 'components/pm2/FieldGrid';
import ResourceChart from 'components/pm2/ResourceChart';
import LogsViewer from 'components/pm2/LogsViewer';
import { formatMemory, formatUptime } from 'data/pm2';
import { askApplicationQuestion } from 'api/pm2';
import { usePm2 } from 'contexts/Pm2Context';

export default function ApplicationDetailsPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { applications, logs, deploymentResults, commandResults, pendingActions } = usePm2();
  const application = applications.find((item) => item.id === Number(id));
  const [tab, setTab] = useState(searchParams.get('tab') || 'overview');
  const [question, setQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState(null);
  const [asking, setAsking] = useState(false);
  const [aiError, setAiError] = useState('');
  const resourceHistory = application ? [{ label: 'Now', cpu: application.cpu || 0, memory: application.memory ? application.memory / 1024 / 1024 / 1024 : 0 }] : [];
  if (!application) return <MainCard><Alert severity="error">Unable to load application. <Button component={Link} to="/applications">Return to Applications</Button></Alert></MainCard>;
  const selectTab = (_, value) => { setTab(value); setSearchParams(value === 'ai' ? {} : { tab: value }); };
  const applicationLogs = logs.filter((entry) => entry.application === application.name);
  const deployment = deploymentResults[application.id];
  const commandResult = commandResults[application.id] || {};
  const gitPullResult = commandResult.gitPull;
  const buildResult = commandResult.build;
  const deploymentPending = pendingActions[application.id] === 'deploy';
  const gitPullPending = pendingActions[application.id] === 'git-pull';
  const buildPending = pendingActions[application.id] === 'build';
  const npmInstallPending = pendingActions[application.id] === 'npm-install';
  const terminalPending = deploymentPending || gitPullPending || buildPending || npmInstallPending;
  const buildCommand = deployment?.buildCommand || buildResult?.command || 'npm run build';
  const pullOutput = deployment?.pullOutput || gitPullResult?.output;
  const buildOutput = deployment?.buildOutput || buildResult?.output;
  const npmInstallOutput = commandResult.npmInstall?.output;
  const askAi = async () => {
    if (!question.trim() || asking) return;
    try {
      setAsking(true);
      setAiError('');
      setAiAnswer(await askApplicationQuestion(application.id, question.trim()));
    } catch (error) {
      setAiError(error.message);
    } finally {
      setAsking(false);
    }
  };
  return (
    <Grid container rowSpacing={3}>
      <Grid size={12}><Stack direction={{ xs: 'column', md: 'row' }} sx={{ alignItems: { md: 'center' }, justifyContent: 'flex-end', gap: 2 }}><Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}><Typography variant="body2" color="text.secondary">{application.name}</Typography><ApplicationStatusChip status={application.status} /></Stack><Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><ApplicationActionButtons application={application} /><ApplicationActionsMenu application={application} /></Stack></Stack></Grid>
      <Grid size={12}><MainCard content={false}><Tabs value={tab} onChange={selectTab} sx={{ px: 2 }}><Tab value="ai" label="AI" /><Tab value="overview" label="Overview" /><Tab value="logs" label="Logs" /><Tab value="environment" label="Environment" /><Tab value="configuration" label="Configuration" /></Tabs><Divider /></MainCard></Grid>
      {tab === 'ai' && <Grid size={12}><MainCard title="Ask AI about this application"><Stack spacing={2}><Typography variant="body2" color="text.secondary">Ask about this project, its PM2 configuration, deployment, or recent logs.</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><TextField fullWidth value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); askAi(); } }} placeholder="Why is this application not starting?" inputProps={{ maxLength: 1000 }} /><Button variant="contained" onClick={askAi} disabled={asking || !question.trim()}>{asking ? <><CircularProgress size={18} color="inherit" sx={{ mr: 1 }} />Thinking…</> : 'Ask AI'}</Button></Stack>{aiError && <Alert severity="error">{aiError}</Alert>}{aiAnswer && <MainCard title="AI response"><Stack spacing={1.5}><Alert severity={aiAnswer.severity || 'info'}>{aiAnswer.answer}</Alert>{aiAnswer.suggestions?.length > 0 && <Stack spacing={0.5}><Typography variant="subtitle2">Suggested next steps</Typography>{aiAnswer.suggestions.map((suggestion, index) => <Typography variant="body2" key={`${suggestion}-${index}`}>• {suggestion}</Typography>)}</Stack>}</Stack></MainCard>}</Stack></MainCard></Grid>}
      {tab === 'overview' && <>
        <Grid size={{ xs: 12, lg: 7 }}><MainCard title="Application Information"><FieldGrid fields={[{ label: 'Application Name', value: application.displayName }, { label: 'PM2 ID', value: application.id }, { label: 'PID', value: application.pid || '-' }, { label: 'Status', value: <ApplicationStatusChip status={application.status} /> }, { label: 'Namespace', value: application.namespace }, { label: 'Mode', value: application.mode }, { label: 'Instances', value: application.instances }, { label: 'Node Version', value: `v${application.nodeVersion}` }, { label: 'Uptime', value: formatUptime(application.uptime) }, { label: 'Restarts', value: application.restarts }, { label: 'Created', value: application.created ? new Date(application.created).toLocaleString() : '—' }]} /></MainCard></Grid>
        <Grid size={{ xs: 12, lg: 5 }}><MainCard title="Deployment terminal"><Stack spacing={1.5}>{terminalPending && <Alert severity="info">Command is running…</Alert>}<Box sx={{ p: 1.5, borderRadius: 1, bgcolor: '#0b1220', color: '#d1fae5', fontFamily: 'Consolas, "Courier New", monospace', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 420 }}>{`${application.cwd}> npm i\n${npmInstallOutput || 'Run npm i to install the application dependencies.'}\n\n${application.cwd}> git pull origin --ff-only\n${pullOutput || 'Run Git Pull Origin to see the terminal response.'}\n\n${application.cwd}> ${buildCommand}\n${buildOutput || 'Run Build to see the terminal response.'}\n\n${application.cwd}> pm2 reload ${application.name}\n${deployment?.reloadOutput || (deployment ? `PM2 reload completed for ${application.name}.` : 'Not run. Use Deploy to pull, build, and reload together.')}`}</Box><Typography variant="caption" color="text.secondary">This terminal shows the actual response returned by npm, Git, the project build command, and PM2.</Typography></Stack></MainCard></Grid>
        <Grid size={12}><MainCard title="Resources"><Grid container spacing={3}><Grid size={{ xs: 12, sm: 6 }}><Typography variant="h6">CPU Usage</Typography><Typography variant="h3" sx={{ my: 1 }}>{application.cpu}%</Typography><ResourceChart labels={resourceHistory.map((point) => point.label)} data={resourceHistory.map((point) => point.cpu)} label="CPU" height={220} /></Grid><Grid size={{ xs: 12, sm: 6 }}><Typography variant="h6">Memory</Typography><Typography variant="h3" sx={{ my: 1 }}>{formatMemory(application.memory)}</Typography><ResourceChart labels={resourceHistory.map((point) => point.label)} data={resourceHistory.map((point) => point.memory)} label="Memory" unit=" GB" height={220} color="info.main" /></Grid></Grid></MainCard></Grid>
      </>}
      {tab === 'logs' && <Grid size={12}><MainCard title="Application Logs" content={false}><LogsViewer entries={applicationLogs} terminal /></MainCard></Grid>}
      {tab === 'environment' && <Grid size={12}><MainCard title="Environment Variables"><FieldGrid fields={(application.environmentKeys || []).map((key) => ({ label: key, value: /pass|secret|token|key|database_url/i.test(key) ? '********' : application.environment?.[key] || 'Configured' }))} /></MainCard></Grid>}
      {tab === 'configuration' && <Grid size={12}><MainCard title="Configuration"><FieldGrid fields={[{ label: 'Script', value: application.script }, { label: 'Execution Mode', value: application.mode }, { label: 'Instances', value: application.instances }, { label: 'Auto Restart', value: application.autorestart ? 'Enabled' : 'Disabled' }, { label: 'Watch', value: application.watch ? 'Enabled' : 'Disabled' }, { label: 'Max Restart Attempts', value: application.maxRestarts ?? 5 }, { label: 'Max Memory Restart', value: application.maxMemoryRestart || 'Disabled' }, { label: 'Restart Delay', value: application.restartDelay ? `${application.restartDelay} ms` : 'None' }]} /></MainCard></Grid>}
    </Grid>
  );
}
