import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MainCard from 'components/MainCard';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import FieldGrid from 'components/pm2/FieldGrid';
import ResourceChart from 'components/pm2/ResourceChart';
import { usePm2 } from 'contexts/Pm2Context';

function formatBytes(value) {
  if (!Number.isFinite(Number(value))) return '—';
  const bytes = Number(value);
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function formatUptime(seconds) {
  if (!Number.isFinite(Number(seconds))) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function Usage({ label, value, color = 'primary' }) {
  return <Stack sx={{ gap: 1 }}><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2">{label}</Typography><Typography variant="body2">{value}%</Typography></Stack><LinearProgress color={color} variant="determinate" value={value} /></Stack>;
}

export default function ServerPage() {
  const { server, serverHistory, error, refreshServer } = usePm2();
  if (!server) return <MainCard><Stack sx={{ gap: 2, p: 2 }}><Alert severity="error">{error || 'Server information is unavailable.'}</Alert><Button variant="outlined" onClick={refreshServer}>Retry</Button></Stack></MainCard>;
  const history = serverHistory.length ? serverHistory : [{ label: 'Now', cpu: server.cpuUsage || 0, memory: server.memory?.usage || 0 }];
  return <Grid container rowSpacing={3} columnSpacing={2.75}>
    <Grid size={{ xs: 12, md: 6 }}><MainCard title="Server Overview"><FieldGrid fields={[{ label: 'Hostname', value: server.hostname }, { label: 'Operating System', value: server.operatingSystem }, { label: 'Architecture', value: server.architecture }, { label: 'Server Uptime', value: formatUptime(server.uptime) }]} /></MainCard></Grid>
    <Grid size={{ xs: 12, md: 6 }}><MainCard title="Runtime"><FieldGrid fields={[{ label: 'Node.js', value: server.runtime.node }, { label: 'PM2', value: server.runtime.pm2 }, { label: 'NPM', value: server.runtime.npm }, { label: 'PM2 Daemon', value: <Chip size="small" variant="combined" color="success" label={server.runtime.daemon} /> }]} /></MainCard></Grid>
    <Grid size={{ xs: 12, md: 6 }}><MainCard title="CPU"><FieldGrid fields={[{ label: 'Processor', value: server.processor }, { label: 'Cores', value: server.cores }, { label: 'CPU Usage', value: `${server.cpuUsage}%` }]} /><ResourceChart labels={history.map((point) => point.label)} data={history.map((point) => point.cpu)} label="CPU" height={220} /></MainCard></Grid>
    <Grid size={{ xs: 12, md: 6 }}><MainCard title="Memory"><Stack sx={{ gap: 2 }}><FieldGrid fields={[{ label: 'Total', value: formatBytes(server.memory.total) }, { label: 'Used', value: formatBytes(server.memory.used) }, { label: 'Available', value: formatBytes(server.memory.available) }, { label: 'Usage', value: `${server.memory.usage.toFixed(1)}%` }]} /><Usage label="Memory usage" value={server.memory.usage} /></Stack></MainCard></Grid>
    <Grid size={12}><MainCard title="Storage"><Grid container spacing={2}><Grid size={{ xs: 12, md: 6 }}><FieldGrid fields={[{ label: 'Drive', value: server.storage?.drive || '—' }, { label: 'Total', value: formatBytes(server.storage?.total) }, { label: 'Used', value: formatBytes(server.storage?.used) }, { label: 'Available', value: formatBytes(server.storage?.available) }]} /></Grid><Grid size={{ xs: 12, md: 6 }}>{server.storage && <Usage label="Storage usage" value={server.storage.usage} color="warning" />}</Grid></Grid></MainCard></Grid>
  </Grid>;
}
