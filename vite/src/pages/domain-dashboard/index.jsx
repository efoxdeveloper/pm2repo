import { useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import BarChartOutlined from '@ant-design/icons/BarChartOutlined';
import CalendarOutlined from '@ant-design/icons/CalendarOutlined';
import GlobalOutlined from '@ant-design/icons/GlobalOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import SafetyCertificateOutlined from '@ant-design/icons/SafetyCertificateOutlined';
import WarningOutlined from '@ant-design/icons/WarningOutlined';
import MainCard from 'components/MainCard';
import { getDomainDashboard } from 'api/domains';
import { useAuth } from 'contexts/AuthContext';

const emptyData = {
  summary: { total: 0, healthy: 0, attention: 0, errors: 0, sslEnabled: 0, sslExpiring: 0, sslExpired: 0, domainExpiring: 0, domainExpired: 0, webspaceTracked: 0, totalWebspace: 0, autoRenewal: 0, scansToday: 0 },
  domains: { atRisk: [], recent: [] },
  expiry: {
    ssl: { expired: 0, seven: 0, thirty: 0, later: 0, unknown: 0 },
    domain: { expired: 0, seven: 0, thirty: 0, later: 0, unknown: 0 }
  }
};

function formatDays(value) {
  if (value === null || value === undefined) return 'Not available';
  const days = Number(value);
  if (!Number.isFinite(days)) return 'Not available';
  if (days < 0) return `${Math.abs(days)} days overdue`;
  return `${days} days`;
}

function formatDate(value) {
  if (!value) return 'Not scanned';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Not scanned' : date.toLocaleString();
}

function daysColor(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'text.secondary';
  if (Number(value) <= 7) return 'error.main';
  if (Number(value) <= 30) return 'warning.main';
  return 'success.main';
}

function statusColor(status) {
  return { healthy: 'success', warning: 'warning', critical: 'error', error: 'error' }[status] || 'default';
}

function MetricCard({ title, value, helper, icon, color = 'primary.main' }) {
  return (
    <MainCard contentSX={{ p: 2.25 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ color, display: 'flex', fontSize: 24 }}>{icon}</Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4">{value}</Typography>
          <Typography variant="body2" color="text.secondary" noWrap>{title}</Typography>
          {helper && <Typography variant="caption" color="text.secondary">{helper}</Typography>}
        </Box>
      </Stack>
    </MainCard>
  );
}

function ExpiryValue({ value }) {
  return <Typography variant="body2" color={daysColor(value)}>{formatDays(value)}</Typography>;
}

function DomainTable({ domains, emptyMessage }) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Domain</TableCell>
            <TableCell>Client</TableCell>
            <TableCell>Health</TableCell>
            <TableCell>SSL expiry</TableCell>
            <TableCell>Domain expiry</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {!domains.length && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 2 }}>{emptyMessage}</Typography></TableCell></TableRow>}
          {domains.map((item) => (
            <TableRow key={item.domain} hover>
              <TableCell><Typography variant="subtitle2">{item.domain}</Typography></TableCell>
              <TableCell>{item.management?.clientCompany || '—'}</TableCell>
              <TableCell><Chip size="small" variant="combined" color={statusColor(item.status)} label={item.status || 'unknown'} /></TableCell>
              <TableCell><ExpiryValue value={item.ssl?.daysRemaining} /></TableCell>
              <TableCell><ExpiryValue value={item.registration?.daysRemaining} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default function DomainDashboardPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadDashboard = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      const payload = await getDomainDashboard();
      setData({ ...emptyData, ...payload, summary: { ...emptyData.summary, ...(payload.summary || {}) }, domains: { ...emptyData.domains, ...(payload.domains || {}) }, expiry: { ...emptyData.expiry, ...(payload.expiry || {}) }});
      setError(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadDashboard(); }, []);

  const { summary, domains, expiry } = data;
  const healthChart = useMemo(() => [
    { id: 'healthy', value: summary.healthy, label: 'Healthy', color: theme.vars.palette.success.main },
    { id: 'warning', value: summary.attention, label: 'Attention', color: theme.vars.palette.warning.main },
    { id: 'errors', value: summary.errors, label: 'Errors', color: theme.vars.palette.error.main }
  ], [summary, theme]);
  const webspacePercent = summary.total ? Math.round((summary.webspaceTracked / summary.total) * 100) : 0;
  const sslPercent = summary.total ? Math.round((summary.sslEnabled / summary.total) * 100) : 0;
  const autoRenewalPercent = summary.total ? Math.round((summary.autoRenewal / summary.total) * 100) : 0;
  const hasDomains = summary.total > 0;

  if (!hasPermission('domain-dashboard.view')) return <Alert severity="error">You do not have permission to view the domain dashboard.</Alert>;

  return (
    <Grid container rowSpacing={3} columnSpacing={2.75}>
      <Grid size={12}>
        <Stack direction={{ xs: 'column', md: 'row' }} sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between', gap: 1 }}>
          <Box>
            <Typography variant="h5">Domain Dashboard</Typography>
            <Typography variant="body2" color="text.secondary">A quick scan of domain health, expiry risk, hosting, and SSL coverage.</Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            {hasPermission('domains.view') && <Button variant="outlined" onClick={() => navigate('/domains')}>Open Domain Monitor</Button>}
            <Button variant="outlined" startIcon={refreshing ? <CircularProgress size={16} /> : <ReloadOutlined />} onClick={() => loadDashboard(true)} disabled={loading || refreshing}>Refresh</Button>
          </Stack>
        </Stack>
      </Grid>
      {error && <Grid size={12}><Alert severity="error" onClose={() => setError(null)}>{error}</Alert></Grid>}
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}><MetricCard title="Monitored domains" value={loading ? '…' : summary.total} helper={`${summary.scansToday} scanned today`} icon={<GlobalOutlined />} /></Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}><MetricCard title="Healthy" value={loading ? '…' : summary.healthy} helper={`${summary.total ? Math.round((summary.healthy / summary.total) * 100) : 0}% of domains`} icon={<SafetyCertificateOutlined />} color="success.main" /></Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}><MetricCard title="Needs attention" value={loading ? '…' : summary.attention + summary.errors} helper={`${summary.errors} scan errors`} icon={<WarningOutlined />} color="warning.main" /></Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}><MetricCard title="Expiring within 30 days" value={loading ? '…' : summary.sslExpiring + summary.domainExpiring} helper={`${summary.sslExpired + summary.domainExpired} already expired`} icon={<CalendarOutlined />} color="error.main" /></Grid>

      <Grid size={{ xs: 12, md: 5 }}>
        <MainCard title="Domain health" content={false}>
          <Stack sx={{ p: 2, alignItems: 'center' }}>
            <PieChart height={230} hideLegend series={[{ innerRadius: 58, outerRadius: 92, paddingAngle: 3, data: healthChart }]} />
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
              <Typography variant="body2" color="success.main">Healthy: {summary.healthy}</Typography>
              <Typography variant="body2" color="warning.main">Attention: {summary.attention}</Typography>
              <Typography variant="body2" color="error.main">Errors: {summary.errors}</Typography>
            </Stack>
          </Stack>
        </MainCard>
      </Grid>
      <Grid size={{ xs: 12, md: 7 }}>
        <MainCard title="Expiry risk overview" content={false}>
          <Stack sx={{ p: 2 }}>
            <BarChart
              height={260}
              hideLegend
              xAxis={[{ scaleType: 'band', data: ['Expired', '≤7 days', '8–30 days', '>30 days'] }]}
              series={[{ label: 'SSL', data: [expiry.ssl.expired, expiry.ssl.seven, expiry.ssl.thirty, expiry.ssl.later], color: theme.vars.palette.error.main }, { label: 'Domain', data: [expiry.domain.expired, expiry.domain.seven, expiry.domain.thirty, expiry.domain.later], color: theme.vars.palette.primary.main }]}
              margin={{ top: 20, right: 20, bottom: 35, left: 45 }}
            />
            <Stack direction="row" spacing={2} sx={{ justifyContent: 'center' }}>
              <Typography variant="caption" color="error.main">SSL certificates</Typography>
              <Typography variant="caption" color="primary.main">Domain registrations</Typography>
            </Stack>
          </Stack>
        </MainCard>
      </Grid>

      <Grid size={{ xs: 12, md: 5 }}>
        <MainCard title="Coverage snapshot">
          <Stack spacing={2}>
            <Box><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2">SSL configured</Typography><Typography variant="body2" fontWeight={600}>{summary.sslEnabled}/{summary.total}</Typography></Stack><LinearProgress variant="determinate" value={sslPercent} color="success" sx={{ mt: 0.75 }} /></Box>
            <Box><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2">Webspace tracked</Typography><Typography variant="body2" fontWeight={600}>{summary.webspaceTracked}/{summary.total}</Typography></Stack><LinearProgress variant="determinate" value={webspacePercent} sx={{ mt: 0.75 }} /></Box>
            <Box><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2">Auto-renewal enabled</Typography><Typography variant="body2" fontWeight={600}>{summary.autoRenewal}/{summary.total}</Typography></Stack><LinearProgress variant="determinate" value={autoRenewalPercent} color="warning" sx={{ mt: 0.75 }} /></Box>
            <Divider />
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Total webspace</Typography><Typography variant="body2" fontWeight={600}>{summary.totalWebspace.toLocaleString()} GB</Typography></Stack>
          </Stack>
        </MainCard>
      </Grid>
      <Grid size={{ xs: 12, md: 7 }}>
        <MainCard title="At-risk domains" content={false}>
          <DomainTable domains={domains.atRisk} emptyMessage={hasDomains ? 'No domains need attention.' : 'Add domains to see risk alerts.'} />
        </MainCard>
      </Grid>
      <Grid size={12}>
        <MainCard title="Recent domain checks" content={false}>
          <TableContainer>
            <Table size="small">
              <TableHead><TableRow><TableCell>Domain</TableCell><TableCell>Last checked</TableCell><TableCell>Status</TableCell><TableCell>Webspace</TableCell><TableCell>SSL</TableCell></TableRow></TableHead>
              <TableBody>
                {!domains.recent.length && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 2 }}>No domain checks available.</Typography></TableCell></TableRow>}
                {domains.recent.map((item) => <TableRow key={item.domain} hover><TableCell><Typography variant="subtitle2">{item.domain}</Typography></TableCell><TableCell>{formatDate(item.scannedAt)}</TableCell><TableCell><Chip size="small" variant="combined" color={statusColor(item.status)} label={item.status || 'unknown'} /></TableCell><TableCell>{item.management?.webspace === null || item.management?.webspace === undefined ? 'Not tracked' : `${item.management.webspace} GB`}</TableCell><TableCell><ExpiryValue value={item.ssl?.daysRemaining} /></TableCell></TableRow>)}
              </TableBody>
            </Table>
          </TableContainer>
        </MainCard>
      </Grid>
      {loading && <Grid size={12}><Stack sx={{ alignItems: 'center' }}><CircularProgress /></Stack></Grid>}
      <Grid size={12}><Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}><BarChartOutlined style={{ color: theme.vars.palette.text.secondary }} /><Typography variant="caption" color="text.secondary">Dashboard data is read-only. Use Domain Monitor to add domains, edit hosting details, or run scans.</Typography></Stack></Grid>
    </Grid>
  );
}
