import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import MainCard from 'components/MainCard';
import Pm2StatCard from 'components/pm2/Pm2StatCard';
import ResourceChart from 'components/pm2/ResourceChart';
import ApplicationTable from 'components/pm2/ApplicationTable';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { PieChart } from '@mui/x-charts/PieChart';
import { useTheme } from '@mui/material/styles';
import { usePm2 } from 'contexts/Pm2Context';

export default function DashboardDefault() {
  const theme = useTheme();
  const { applications: visibleApplications, server, serverHistory, loading, error, refreshApplications } = usePm2();
  const counts = visibleApplications.reduce((result, app) => ({ ...result, [app.status]: (result[app.status] || 0) + 1 }), {});
  const history = serverHistory.length ? serverHistory : server ? [{ label: 'Now', cpu: server.cpuUsage || 0, memory: server.memory?.usage || 0 }] : [];
  const memoryUsed = server?.memory ? `${(server.memory.used / 1024 / 1024 / 1024).toFixed(1)} GB / ${(server.memory.total / 1024 / 1024 / 1024).toFixed(1)} GB` : '…';
  return (
    <Grid container rowSpacing={4.5} columnSpacing={2.75}>
      <Grid sx={{ mb: -2.25 }} size={12}><Typography variant="h5">Dashboard</Typography></Grid>
      {error && <Grid size={12}><Alert severity="error" action={<Button color="inherit" size="small" onClick={refreshApplications}>Retry</Button>}>{error}</Alert></Grid>}
      <Grid size={{ xs: 12, sm: 6, lg: 4, xl: 2 }}><Pm2StatCard title="Total Applications" value={loading ? '…' : String(visibleApplications.length)} helper="Managed by PM2" /></Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 4, xl: 2 }}><Pm2StatCard title="Online" value={loading ? '…' : String(counts.online || 0)} helper="Healthy processes" /></Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 4, xl: 2 }}><Pm2StatCard title="Stopped" value={loading ? '…' : String(counts.stopped || 0)} helper="Currently stopped" /></Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 4, xl: 2 }}><Pm2StatCard title="Errored" value={loading ? '…' : String(counts.errored || 0)} helper="Need attention" /></Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 4, xl: 2 }}><Pm2StatCard title="CPU Usage" value={server ? `${server.cpuUsage}%` : '…'} helper="Current server usage" /></Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 4, xl: 2 }}><Pm2StatCard title="Memory Usage" value={memoryUsed} helper={server ? `${server.memory.usage.toFixed(1)}% used` : 'Loading'} /></Grid>

      <Grid size={{ xs: 12, md: 6 }}><MainCard title="CPU Usage"><ResourceChart labels={history.map((point) => point.label)} data={history.map((point) => point.cpu)} label="CPU" /></MainCard></Grid>
      <Grid size={{ xs: 12, md: 6 }}><MainCard title="Memory Usage"><ResourceChart labels={history.map((point) => point.label)} data={history.map((point) => point.memory)} label="Memory" color="info.main" /></MainCard></Grid>

      <Grid size={{ xs: 12, md: 5, lg: 4 }}>
        <MainCard title="Application Status">
          <Stack sx={{ alignItems: 'center' }}>
            <div style={{ width: '100%' }}><PieChart height={230} hideLegend series={[{ innerRadius: 55, outerRadius: 90, paddingAngle: 2, data: [{ id: 'online', value: counts.online || 0, label: 'Online', color: theme.vars.palette.success.main }, { id: 'stopped', value: counts.stopped || 0, label: 'Stopped', color: theme.vars.palette.warning.main }, { id: 'errored', value: counts.errored || 0, label: 'Errored', color: theme.vars.palette.error.main }] }]} /></div>
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
              <Typography variant="body2" color="success.main">Online: {counts.online || 0}</Typography><Typography variant="body2" color="warning.main">Stopped: {counts.stopped || 0}</Typography><Typography variant="body2" color="error.main">Errored: {counts.errored || 0}</Typography>
            </Stack>
          </Stack>
        </MainCard>
      </Grid>
      <Grid size={{ xs: 12, md: 7, lg: 8 }}>
        <MainCard title="Applications Overview" content={false}><ApplicationTable applications={visibleApplications} overview /></MainCard>
      </Grid>
    </Grid>
  );
}
