import Grid from '@mui/material/Grid';
import MainCard from 'components/MainCard';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import FieldGrid from 'components/pm2/FieldGrid';
import ResourceChart from 'components/pm2/ResourceChart';
import { metrics, server } from 'data/pm2';

function Usage({ label, value, color = 'primary' }) {
  return <Stack sx={{ gap: 1 }}><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2">{label}</Typography><Typography variant="body2">{value}%</Typography></Stack><LinearProgress color={color} variant="determinate" value={value} /></Stack>;
}

export default function ServerPage() {
  return <Grid container rowSpacing={3} columnSpacing={2.75}>
    <Grid size={{ xs: 12, md: 6 }}><MainCard title="Server Overview"><FieldGrid fields={[{ label: 'Hostname', value: server.hostname }, { label: 'Operating System', value: server.operatingSystem }, { label: 'Architecture', value: server.architecture }, { label: 'Server Uptime', value: server.uptime }]} /></MainCard></Grid>
    <Grid size={{ xs: 12, md: 6 }}><MainCard title="Runtime"><FieldGrid fields={[{ label: 'Node.js', value: server.runtime.node }, { label: 'PM2', value: server.runtime.pm2 }, { label: 'NPM', value: server.runtime.npm }, { label: 'PM2 Daemon', value: <Chip size="small" variant="combined" color="success" label={server.runtime.daemon} /> }]} /></MainCard></Grid>
    <Grid size={{ xs: 12, md: 6 }}><MainCard title="CPU"><FieldGrid fields={[{ label: 'Processor', value: server.processor }, { label: 'Cores', value: server.cores }, { label: 'CPU Usage', value: `${server.cpuUsage}%` }]} /><ResourceChart labels={metrics.labels} data={metrics.cpu} label="CPU" height={220} /></MainCard></Grid>
    <Grid size={{ xs: 12, md: 6 }}><MainCard title="Memory"><Stack sx={{ gap: 2 }}><FieldGrid fields={[{ label: 'Total', value: `${server.memory.total} GB` }, { label: 'Used', value: `${server.memory.used} GB` }, { label: 'Available', value: `${server.memory.available} GB` }, { label: 'Usage', value: `${server.memory.usage}%` }]} /><Usage label="Memory usage" value={server.memory.usage} /></Stack></MainCard></Grid>
    <Grid size={12}><MainCard title="Storage"><Grid container spacing={2}><Grid size={{ xs: 12, md: 6 }}><FieldGrid fields={[{ label: 'Drive', value: server.storage.drive }, { label: 'Total', value: `${server.storage.total} GB` }, { label: 'Used', value: `${server.storage.used} GB` }, { label: 'Available', value: `${server.storage.available} GB` }]} /></Grid><Grid size={{ xs: 12, md: 6 }}><Usage label="Storage usage" value={server.storage.usage} color="warning" /></Grid></Grid></MainCard></Grid>
  </Grid>;
}
