import { useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloseOutlined from '@ant-design/icons/CloseOutlined';
import GlobalOutlined from '@ant-design/icons/GlobalOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import EyeOutlined from '@ant-design/icons/EyeOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import SafetyCertificateOutlined from '@ant-design/icons/SafetyCertificateOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import MainCard from 'components/MainCard';
import { deleteDomain, getDomains, scanDomains, updateDomainScan } from 'api/domains';

const statusColors = { healthy: 'success', warning: 'warning', critical: 'error', error: 'error' };

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString();
}

function formatDays(value) {
  if (value === null || value === undefined) return '—';
  return value < 0 ? `${Math.abs(value)} days overdue` : `${value} days`;
}

function formatRemainingDays(value) {
  return value === null || value === undefined ? '—' : `${value} days`;
}

function getDaysColor(value) {
  if (value === null || value === undefined) return 'text.secondary';
  if (value <= 7) return 'error.main';
  if (value <= 30) return 'warning.main';
  return 'success.main';
}

function DetailRow({ label, children }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, py: 0.75 }}>
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 140 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
        {children || '—'}
      </Typography>
    </Stack>
  );
}

function DomainDetails({ domain }) {
  const ssl = domain.ssl || {};
  const dns = domain.dns || {};
  const http = domain.http || {};
  const registration = domain.registration || {};
  return (
    <Stack sx={{ gap: 2 }}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <MainCard title="SSL certificate">
            <DetailRow label="Subject">{ssl.subject?.CN || '—'}</DetailRow>
            <DetailRow label="Issuer">{ssl.issuer?.O || ssl.issuer?.CN}</DetailRow>
            <DetailRow label="Valid from">{formatDate(ssl.validFrom)}</DetailRow>
            <DetailRow label="Expires">{formatDate(ssl.validTo)}</DetailRow>
            <DetailRow label="Remaining">{formatDays(ssl.daysRemaining)}</DetailRow>
            <DetailRow label="TLS protocol">{ssl.protocol}</DetailRow>
            <DetailRow label="Fingerprint">{ssl.fingerprint256}</DetailRow>
            <DetailRow label="Browser trusted">{ssl.authorized === true ? 'Yes' : ssl.authorizationError || 'No'}</DetailRow>
          </MainCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <MainCard title="HTTPS endpoint">
            <DetailRow label="Status">{http.statusCode ? `${http.statusCode} ${http.statusMessage || ''}` : http.error}</DetailRow>
            <DetailRow label="Response time">{http.responseTime ? `${http.responseTime} ms` : '—'}</DetailRow>
            <DetailRow label="Server">{http.headers?.server}</DetailRow>
            <DetailRow label="Content type">{http.headers?.['content-type']}</DetailRow>
            <DetailRow label="Redirect target">{http.headers?.location}</DetailRow>
            <DetailRow label="Last scanned">{formatDate(domain.scannedAt)}</DetailRow>
          </MainCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <MainCard title="Domain registration">
            <DetailRow label="Expires">{formatDate(registration.expiresAt)}</DetailRow>
            <DetailRow label="Remaining">{formatDays(registration.daysRemaining)}</DetailRow>
            <DetailRow label="Source">RDAP</DetailRow>
            <DetailRow label="Status">{registration.available === true ? 'Available' : registration.error}</DetailRow>
          </MainCard>
        </Grid>
      </Grid>
      <MainCard title="DNS records">
        <DetailRow label="IPv4 (A)">{dns.ipv4?.join(', ')}</DetailRow>
        <DetailRow label="IPv6 (AAAA)">{dns.ipv6?.join(', ')}</DetailRow>
        <DetailRow label="CNAME">{dns.cname?.join(', ')}</DetailRow>
        <DetailRow label="Nameservers">{dns.ns?.join(', ')}</DetailRow>
        <DetailRow label="Mail servers">{dns.mx?.map((item) => `${item.exchange} (priority ${item.priority})`).join(', ')}</DetailRow>
        <DetailRow label="CAA">
          {dns.caa?.map((item) => `${item.issue || item.issuewild || item.iodef || ''}${item.issue ? '' : ' record'}`).join(', ')}
        </DetailRow>
        <DetailRow label="TXT">{dns.txt?.join(' | ')}</DetailRow>
      </MainCard>
    </Stack>
  );
}

export default function DomainsPage() {
  const [domains, setDomains] = useState([]);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [updatingDomain, setUpdatingDomain] = useState('');
  const [error, setError] = useState(null);

  const loadDomains = async () => {
    try {
      setLoading(true);
      const payload = await getDomains();
      setDomains(payload.domains || []);
      setError(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDomains();
  }, []);

  const filteredDomains = useMemo(
    () => domains.filter((item) => item.domain.toLowerCase().includes(query.toLowerCase())),
    [domains, query]
  );
  const summary = useMemo(
    () => ({
      total: domains.length,
      healthy: domains.filter((item) => item.status === 'healthy').length,
      attention: domains.filter((item) => ['warning', 'critical'].includes(item.status)).length,
      errors: domains.filter((item) => item.status === 'error').length
    }),
    [domains]
  );

  const handleScan = async () => {
    try {
      setScanning(true);
      setError(null);
      const payload = await scanDomains(input);
      setDomains((current) => {
        const updated = new Map(current.map((item) => [item.domain, item]));
        (payload.domains || []).forEach((item) => updated.set(item.domain, item));
        return [...updated.values()].sort((left, right) => left.domain.localeCompare(right.domain));
      });
      setInput('');
      setDrawerOpen(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setScanning(false);
    }
  };

  const handleScanNow = () => {
    if (!input.trim()) {
      setDrawerOpen(true);
      return;
    }
    handleScan();
  };

  const handleRescan = async (domain) => {
    try {
      setScanning(true);
      const payload = await scanDomains([domain]);
      const result = payload.domains?.[0];
      if (result) {
        setDomains((current) => current.map((item) => (item.domain === domain ? result : item)));
        setSelected(result);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setScanning(false);
    }
  };

  const handleDelete = async (domain) => {
    if (!window.confirm(`Remove ${domain} from monitoring?`)) return;
    try {
      const payload = await deleteDomain(domain);
      setDomains(payload.domains || []);
      if (selected?.domain === domain) setSelected(null);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleToggleScan = async (domain, enabled) => {
    try {
      setUpdatingDomain(domain);
      const payload = await updateDomainScan(domain, enabled);
      setDomains(payload.domains || []);
      if (selected?.domain === domain) setSelected((current) => current ? { ...current, scanEnabled: enabled } : current);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUpdatingDomain('');
    }
  };

  return (
    <Grid container rowSpacing={3} columnSpacing={2.75}>
      <Grid size={12}>
        <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: 1, justifyContent: 'space-between', alignItems: { md: 'center' } }}>
          <Box>
            <Typography variant="h5">Domain Monitor</Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
            <Button variant="contained" startIcon={<PlusOutlined />} onClick={() => setDrawerOpen(true)} disabled={scanning}>
              Add Domains
            </Button>
            <Button variant="outlined" onClick={handleScanNow} disabled={scanning}>
              {scanning ? <CircularProgress size={20} color="inherit" /> : 'Save Now'}
            </Button>
            <Button variant="outlined" startIcon={<ReloadOutlined />} onClick={loadDomains} disabled={loading || scanning}>
              Refresh list
            </Button>
          </Stack>
        </Stack>
      </Grid>
      {error && (
        <Grid size={12}>
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </Grid>
      )}
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <MainCard>
          <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center' }}>
            <GlobalOutlined style={{ fontSize: 24, color: '#1677ff' }} />
            <Box>
              <Typography variant="h4">{summary.total}</Typography>
              <Typography variant="body2" color="text.secondary">
                Monitored domains
              </Typography>
            </Box>
          </Stack>
        </MainCard>
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <MainCard>
          <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center' }}>
            <SafetyCertificateOutlined style={{ fontSize: 24, color: '#52c41a' }} />
            <Box>
              <Typography variant="h4">{summary.healthy}</Typography>
              <Typography variant="body2" color="text.secondary">
                Healthy certificates
              </Typography>
            </Box>
          </Stack>
        </MainCard>
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <MainCard>
          <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center' }}>
            <SafetyCertificateOutlined style={{ fontSize: 24, color: '#faad14' }} />
            <Box>
              <Typography variant="h4">{summary.attention}</Typography>
              <Typography variant="body2" color="text.secondary">
                Expiring soon
              </Typography>
            </Box>
          </Stack>
        </MainCard>
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <MainCard>
          <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center' }}>
            <GlobalOutlined style={{ fontSize: 24, color: '#ff4d4f' }} />
            <Box>
              <Typography variant="h4">{summary.errors}</Typography>
              <Typography variant="body2" color="text.secondary">
                Scan errors
              </Typography>
            </Box>
          </Stack>
        </MainCard>
      </Grid>
      <Grid size={12}>
        <MainCard
          content={false}
          title="Monitored domains"
          secondary={
            <TextField
              size="small"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter domains"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlined />
                    </InputAdornment>
                  )
                }
              }}
            />
          }
        >
          <Divider />
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow>
                  {['Domain', 'IP address', 'SSL days', 'Domain expiry days', 'Scan', 'Status', 'Actions'].map((header) => (
                    <TableCell key={header}>{header}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Stack sx={{ alignItems: 'center', py: 5 }}>
                        <CircularProgress size={28} />
                      </Stack>
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !filteredDomains.length && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Box sx={{ py: 5, textAlign: 'center' }}>
                        <Typography color="text.secondary">No domains monitored yet. Add domains above to begin.</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
                {filteredDomains.map((item) => (
                  <TableRow hover key={item.domain}>
                    <TableCell>
                      <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                        <GlobalOutlined />
                        <Typography variant="subtitle2">{item.domain}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220, wordBreak: 'break-word' }}>
                      {(item.dns?.ipv4?.length ? item.dns.ipv4 : item.dns?.ipv6 || []).join(', ') || '—'}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color={getDaysColor(item.ssl?.daysRemaining)}>
                        {formatRemainingDays(item.ssl?.daysRemaining)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color={getDaysColor(item.registration?.daysRemaining)}>
                        {formatRemainingDays(item.registration?.daysRemaining)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={item.scanEnabled === false ? 'Scheduled scanning is off' : 'Scheduled scanning is on'}>
                        <Switch size="small" checked={item.scanEnabled !== false} onChange={(event) => handleToggleScan(item.domain, event.target.checked)} disabled={updatingDomain === item.domain} inputProps={{ 'aria-label': `Toggle scheduled scan for ${item.domain}` }} />
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={item.statusMessage || ''}>
                        <Chip size="small" variant="combined" color={statusColors[item.status] || 'secondary'} label={item.status} />
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row">
                        <Tooltip title="View details">
                          <IconButton size="small" onClick={() => setSelected(item)}>
                            <EyeOutlined />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={item.scanEnabled === false ? 'Scanning is off for this domain' : 'Scan again'}>
                          <IconButton size="small" onClick={() => handleRescan(item.domain)} disabled={scanning || item.scanEnabled === false}>
                            <ReloadOutlined />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove">
                          <IconButton size="small" color="error" onClick={() => handleDelete(item.domain)}>
                            <DeleteOutlined />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </MainCard>
      </Grid>
      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="lg">
        <DialogTitle>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
            <Box>
              <Typography variant="h5">{selected?.domain}</Typography>
              <Typography variant="body2" color="text.secondary">
                {selected?.statusMessage}
              </Typography>
            </Box>
            <Chip
              size="small"
              variant="combined"
              color={statusColors[selected?.status] || 'secondary'}
              label={selected?.status || 'unknown'}
            />
          </Stack>
        </DialogTitle>
        <DialogContent dividers>{selected && <DomainDetails domain={selected} />}</DialogContent>
      </Dialog>
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 440 } } }}
      >
        <Stack sx={{ height: '100%', p: 3, gap: 2 }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h5">Add Domains</Typography>
            <IconButton aria-label="Close" onClick={() => setDrawerOpen(false)}>
              <CloseOutlined />
            </IconButton>
          </Stack>
          <Divider />
          <TextField
            fullWidth
            multiline
            minRows={8}
            maxRows={16}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={'example.com\napi.example.com\nshop.example.org'}
            helperText="Enter one domain per line, or separate domains with commas or spaces."
            autoFocus
          />
          <Box sx={{ mt: 'auto' }}>
            <Button fullWidth variant="contained" onClick={handleScan} disabled={scanning || !input.trim()}>
              {scanning ? <CircularProgress size={22} color="inherit" /> : 'Save Now'}
            </Button>
          </Box>
        </Stack>
      </Drawer>
    </Grid>
  );
}
