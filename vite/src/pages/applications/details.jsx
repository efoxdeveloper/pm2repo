import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import MainCard from 'components/MainCard';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import ApplicationStatusChip from 'components/pm2/ApplicationStatusChip';
import ApplicationActionsMenu from 'components/pm2/ApplicationActionsMenu';
import ApplicationActionButtons from 'components/pm2/ApplicationActionButtons';
import FieldGrid from 'components/pm2/FieldGrid';
import ResourceChart from 'components/pm2/ResourceChart';
import LogsViewer from 'components/pm2/LogsViewer';
import { metrics, formatMemory } from 'data/pm2';
import { usePm2 } from 'contexts/Pm2Context';

export default function ApplicationDetailsPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { applications, logs } = usePm2();
  const application = applications.find((item) => item.id === Number(id));
  const [tab, setTab] = useState(searchParams.get('tab') || 'overview');
  if (!application) return <MainCard><Alert severity="error">Unable to load application. <Button component={Link} to="/applications">Return to Applications</Button></Alert></MainCard>;
  const selectTab = (_, value) => { setTab(value); setSearchParams(value === 'overview' ? {} : { tab: value }); };
  const applicationLogs = logs.filter((entry) => entry.application === application.name);
  return (
    <Grid container rowSpacing={3}>
      <Grid size={12}><Stack direction={{ xs: 'column', md: 'row' }} sx={{ alignItems: { md: 'center' }, justifyContent: 'flex-end', gap: 2 }}><Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}><Typography variant="body2" color="text.secondary">{application.name}</Typography><ApplicationStatusChip status={application.status} /></Stack><Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><ApplicationActionButtons application={application} /><ApplicationActionsMenu application={application} /></Stack></Stack></Grid>
      <Grid size={12}><MainCard content={false}><Tabs value={tab} onChange={selectTab} sx={{ px: 2 }}><Tab value="overview" label="Overview" /><Tab value="logs" label="Logs" /><Tab value="environment" label="Environment" /><Tab value="configuration" label="Configuration" /></Tabs><Divider /></MainCard></Grid>
      {tab === 'overview' && <>
        <Grid size={{ xs: 12, lg: 7 }}><MainCard title="Application Information"><FieldGrid fields={[{ label: 'Application Name', value: application.displayName }, { label: 'PM2 ID', value: application.id }, { label: 'PID', value: application.pid || '-' }, { label: 'Status', value: <ApplicationStatusChip status={application.status} /> }, { label: 'Namespace', value: application.namespace }, { label: 'Mode', value: application.mode }, { label: 'Instances', value: application.instances }, { label: 'Node Version', value: `v${application.nodeVersion}` }, { label: 'Uptime', value: application.uptime ? '3 days 4 hours' : '-' }, { label: 'Restarts', value: application.restarts }, { label: 'Created', value: application.created }]} /></MainCard></Grid>
        <Grid size={{ xs: 12, lg: 5 }}><MainCard title="Paths"><FieldGrid fields={[{ label: 'Script Path', value: `${application.cwd}\\${application.script}` }, { label: 'Working Directory', value: application.cwd }, { label: 'Error Log', value: application.errorLog }, { label: 'Output Log', value: application.outputLog }]} /></MainCard></Grid>
        <Grid size={12}><MainCard title="Resources"><Grid container spacing={3}><Grid size={{ xs: 12, sm: 6 }}><Typography variant="h6">CPU Usage</Typography><Typography variant="h3" sx={{ my: 1 }}>{application.cpu}%</Typography><ResourceChart labels={metrics.labels} data={metrics.cpu} label="CPU" height={220} /></Grid><Grid size={{ xs: 12, sm: 6 }}><Typography variant="h6">Memory</Typography><Typography variant="h3" sx={{ my: 1 }}>{formatMemory(application.memory)}</Typography><ResourceChart labels={metrics.labels} data={metrics.memory} label="Memory" unit=" GB" height={220} color="info.main" /></Grid></Grid></MainCard></Grid>
      </>}
      {tab === 'logs' && <Grid size={12}><MainCard title="Application Logs" subheader={application.displayName} content={false}><LogsViewer entries={applicationLogs} terminal /></MainCard></Grid>}
      {tab === 'environment' && <Grid size={12}><MainCard title="Environment Variables"><FieldGrid fields={[{ label: 'NODE_ENV', value: 'production' }, { label: 'PORT', value: '5001' }, { label: 'DATABASE_URL', value: '********' }]} /></MainCard></Grid>}
      {tab === 'configuration' && <Grid size={12}><MainCard title="Configuration"><FieldGrid fields={[{ label: 'Script', value: application.script }, { label: 'Execution Mode', value: application.mode }, { label: 'Instances', value: application.instances }, { label: 'Auto Restart', value: 'Enabled' }, { label: 'Watch', value: 'Disabled' }, { label: 'Max Memory Restart', value: '500M' }]} /></MainCard></Grid>}
    </Grid>
  );
}
