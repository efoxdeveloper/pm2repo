import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloseOutlined from '@ant-design/icons/CloseOutlined';
import GlobalOutlined from '@ant-design/icons/GlobalOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import EditOutlined from '@ant-design/icons/EditOutlined';
import EyeOutlined from '@ant-design/icons/EyeOutlined';
import MoreOutlined from '@ant-design/icons/MoreOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import SafetyCertificateOutlined from '@ant-design/icons/SafetyCertificateOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import MainCard from 'components/MainCard';
import { deleteDomain, exportDomains, getDomainOptions, getDomains, scanDomains, updateDomainManagement, updateDomainScan } from 'api/domains';

const statusColors = { healthy: 'success', warning: 'warning', critical: 'error', error: 'error' };
const popularRegistrars = ['GoDaddy', 'Namecheap', 'Cloudflare Registrar', 'Google Domains', 'Hostinger', 'Bluehost', 'PublicDomainRegistry.com'];

function createDefaultManagement() {
  return {
    clientCompany: '',
    maintenanceResponsibility: '',
    registrar: '',
    registrarOption: '',
    dnsManagedBy: '',
    autoRenewal: false,
    primaryContact: '',
    webspace: '',
    notes: ''
  };
}

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
      <Typography variant="body2" sx={{ wordBreak: 'break-word', fontWeight: 500 }}>
        {children || '—'}
      </Typography>
    </Stack>
  );
}

function ManagementDetails({ management }) {
  return (
    <MainCard title="Domain management">
      <Grid container spacing={1}>
        <Grid size={{ xs: 12, md: 6 }}><DetailRow label="Client / Company">{management.clientCompany}</DetailRow></Grid>
        <Grid size={{ xs: 12, md: 6 }}><DetailRow label="Primary contact">{management.primaryContact}</DetailRow></Grid>
        <Grid size={{ xs: 12, md: 6 }}><DetailRow label="Maintenance responsibility">{management.maintenanceResponsibility}</DetailRow></Grid>
        <Grid size={{ xs: 12, md: 6 }}><DetailRow label="Registrar">{management.registrar}</DetailRow></Grid>
        <Grid size={{ xs: 12, md: 6 }}><DetailRow label="DNS managed by">{management.dnsManagedBy}</DetailRow></Grid>
        <Grid size={{ xs: 12, md: 6 }}><DetailRow label="Auto-renewal">{management.autoRenewal ? 'Yes' : 'No'}</DetailRow></Grid>
        <Grid size={{ xs: 12, md: 6 }}><DetailRow label="Webspace">{management.webspace === null || management.webspace === undefined || management.webspace === '' ? '—' : `${management.webspace} GB`}</DetailRow></Grid>
        <Grid size={{ xs: 12, md: 6 }}><DetailRow label="Registration date">{management.registrationDate || 'Unavailable from registry'}</DetailRow></Grid>
        <Grid size={{ xs: 12, md: 6 }}><DetailRow label="Expiry date">{management.expiryDate || 'Unavailable from registry'}</DetailRow></Grid>
        <Grid size={12}><DetailRow label="Notes">{management.notes}</DetailRow></Grid>
      </Grid>
    </MainCard>
  );
}

function SecurityDetails({ domain }) {
  const ssl = domain.ssl || {};
  const http = domain.http || {};
  const registration = domain.registration || {};
  return (
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
          <DetailRow label="Registrar">{registration.registrar}</DetailRow>
          <DetailRow label="Registered">{registration.registrationDate || '—'}</DetailRow>
          <DetailRow label="Expires">{formatDate(registration.expiresAt)}</DetailRow>
          <DetailRow label="Remaining">{formatDays(registration.daysRemaining)}</DetailRow>
          <DetailRow label="Source">RDAP</DetailRow>
          <DetailRow label="Status">{registration.available === true ? 'Available' : registration.error}</DetailRow>
        </MainCard>
      </Grid>
    </Grid>
  );
}

function DnsDetails({ domain }) {
  const dns = domain.dns || {};
  return (
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
  );
}

function DomainDetails({ domain, tab }) {
  const management = domain.management || {};
  const registration = domain.registration || {};
  const http = domain.http || {};
  const ips = [...(domain.dns?.ipv4 || []), ...(domain.dns?.ipv6 || [])].join(', ');
  if (tab === 1) return <ManagementDetails management={management} />;
  if (tab === 2) return <SecurityDetails domain={domain} />;
  if (tab === 3) return <DnsDetails domain={domain} />;
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 7 }}><ManagementDetails management={management} /></Grid>
      <Grid size={{ xs: 12, md: 5 }}>
        <Stack sx={{ gap: 2 }}>
          <MainCard title="Monitoring summary">
            <Stack sx={{ gap: 1 }}>
              <DetailRow label="Health"><Chip size="small" variant="combined" color={statusColors[domain.status] || 'secondary'} label={domain.status || 'unknown'} /></DetailRow>
              <DetailRow label="HTTPS">{http.reachable ? 'Reachable' : 'Unavailable'}</DetailRow>
              <DetailRow label="IP address">{ips}</DetailRow>
              <DetailRow label="Last scanned">{formatDate(domain.scannedAt)}</DetailRow>
            </Stack>
          </MainCard>
          <MainCard title="Registry summary">
            <DetailRow label="Registrar">{registration.registrar || management.registrar}</DetailRow>
            <DetailRow label="Expiry">{formatDate(registration.expiresAt)}</DetailRow>
            <DetailRow label="Remaining">{formatDays(registration.daysRemaining)}</DetailRow>
            <DetailRow label="Lookup source">RDAP</DetailRow>
          </MainCard>
        </Stack>
      </Grid>
    </Grid>
  );
}

export default function DomainsPage() {
  const [domains, setDomains] = useState([]);
  const [input, setInput] = useState('');
  const [filters, setFilters] = useState({ search: '', clientCompany: '', maintenanceResponsibility: '', registrar: '', autoRenewal: '', status: '', expiry: '' });
  const [domainOptions, setDomainOptions] = useState({ clientCompanies: [], registrars: [] });
  const [pagination, setPagination] = useState({ page: 0, pageSize: 10, total: 0 });
  const [summary, setSummary] = useState({ total: 0, healthy: 0, attention: 0, errors: 0 });
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState(0);
  const [actionMenuAnchor, setActionMenuAnchor] = useState(null);
  const [actionMenuDomain, setActionMenuDomain] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState(null);
  const [managementForm, setManagementForm] = useState(createDefaultManagement);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [savingManagement, setSavingManagement] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [updatingDomain, setUpdatingDomain] = useState('');
  const [error, setError] = useState(null);

  const loadDomains = async (requestedPage = pagination.page) => {
    try {
      setLoading(true);
      const payload = await getDomains({ ...filters, page: requestedPage + 1, pageSize: pagination.pageSize });
      setDomains(payload.domains || []);
      setPagination((current) => ({ ...current, page: (payload.pagination?.page || requestedPage + 1) - 1, total: payload.pagination?.total || 0 }));
      setSummary(payload.summary || { total: 0, healthy: 0, attention: 0, errors: 0 });
      setError(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDomainOptions = async () => {
    try {
      const payload = await getDomainOptions();
      setDomainOptions(payload.options || { clientCompanies: [], registrars: [] });
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  useEffect(() => {
    loadDomains();
  }, [filters, pagination.page, pagination.pageSize]);

  useEffect(() => {
    loadDomainOptions();
  }, []);

  const updateFilterValue = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPagination((current) => ({ ...current, page: 0 }));
  };

  const updateFilter = (key) => (event) => updateFilterValue(key, event.target.value);

  const clearFilters = () => {
    setFilters({ search: '', clientCompany: '', maintenanceResponsibility: '', registrar: '', autoRenewal: '', status: '', expiry: '' });
    setPagination((current) => ({ ...current, page: 0 }));
  };

  const handleRefresh = async () => {
    await Promise.all([loadDomains(), loadDomainOptions()]);
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const blob = await exportDomains(filters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'domain-monitor-export.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setExporting(false);
    }
  };

  const handleScan = async () => {
    try {
      setScanning(true);
      setError(null);
      await scanDomains(input, managementForm);
      await loadDomains(0);
      await loadDomainOptions();
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

  const openAddDrawer = () => {
    setInput('');
    setEditingDomain(null);
    setManagementForm(createDefaultManagement());
    setDrawerOpen(true);
  };

  const openEditDrawer = (domain) => {
    const management = domain.management || {};
    const registrar = management.registrar || '';
    setInput(domain.domain);
    setEditingDomain(domain.domain);
    setManagementForm({
      ...createDefaultManagement(),
      ...management,
      registrarOption: popularRegistrars.includes(registrar) ? registrar : registrar ? 'Other / Custom' : ''
    });
    setDrawerOpen(true);
  };

  const handleSaveDomain = async () => {
    if (!editingDomain) {
      await handleScan();
      return;
    }
    try {
      setSavingManagement(true);
      setError(null);
      const payload = await updateDomainManagement(editingDomain, managementForm);
      const updated = (payload.domains || []).find((item) => item.domain === editingDomain);
      if (selected?.domain === editingDomain && updated) setSelected(updated);
      await loadDomains();
      await loadDomainOptions();
      setEditingDomain(null);
      setDrawerOpen(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingManagement(false);
    }
  };

  const openActionMenu = (event, domain) => {
    setActionMenuAnchor(event.currentTarget);
    setActionMenuDomain(domain);
  };

  const closeActionMenu = () => {
    setActionMenuAnchor(null);
    setActionMenuDomain('');
  };

  const actionDomain = domains.find((item) => item.domain === actionMenuDomain);

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
      await deleteDomain(domain);
      await loadDomains();
      await loadDomainOptions();
      if (selected?.domain === domain) setSelected(null);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleToggleScan = async (domain, enabled) => {
    try {
      setUpdatingDomain(domain);
      const payload = await updateDomainScan(domain, enabled);
      const updated = (payload.domains || []).find((item) => item.domain === domain);
      if (selected?.domain === domain) setSelected(updated || ((current) => current ? { ...current, scanEnabled: enabled } : current));
      await loadDomains();
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
            <Button variant="contained" startIcon={<PlusOutlined />} onClick={openAddDrawer} disabled={scanning}>
              Add Domain
            </Button>
            <Button variant="outlined" onClick={handleScanNow} disabled={scanning}>
              {scanning ? <CircularProgress size={20} color="inherit" /> : 'Scan Now'}
            </Button>
            <Button variant="outlined" onClick={handleExport} disabled={exporting || loading}>
              {exporting ? <CircularProgress size={20} color="inherit" /> : 'Export CSV'}
            </Button>
            <Button variant="outlined" startIcon={<ReloadOutlined />} onClick={handleRefresh} disabled={loading || scanning}>
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
        >
          <Stack sx={{ p: 2, gap: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: 2 }}>
              <TextField size="small" label="Search" value={filters.search} onChange={updateFilter('search')} placeholder="Domain, client, registrar..." slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchOutlined /></InputAdornment> } }} sx={{ minWidth: { md: 280 } }} />
              <Autocomplete
                options={domainOptions.clientCompanies}
                openOnFocus
                value={filters.clientCompany || null}
                onChange={(_event, value) => updateFilterValue('clientCompany', value || '')}
                renderInput={(params) => <TextField {...params} size="small" label="Client / Company" placeholder="Search clients" />}
                fullWidth
              />
              <Autocomplete
                options={domainOptions.registrars}
                openOnFocus
                value={filters.registrar || null}
                onChange={(_event, value) => updateFilterValue('registrar', value || '')}
                renderInput={(params) => <TextField {...params} size="small" label="Registrar" placeholder="Search registrars" />}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: 2 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Maintenance</InputLabel>
                <Select label="Maintenance" value={filters.maintenanceResponsibility} onChange={updateFilter('maintenanceResponsibility')}>
                  <MenuItem value="">All maintenance types</MenuItem>
                  <MenuItem value="Us">Us</MenuItem>
                  <MenuItem value="Client">Client</MenuItem>
                  <MenuItem value="Shared">Shared</MenuItem>
                  <MenuItem value="Third-party vendor">Third-party vendor</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Auto-renewal</InputLabel>
                <Select label="Auto-renewal" value={filters.autoRenewal} onChange={updateFilter('autoRenewal')}>
                  <MenuItem value="">All auto-renewal states</MenuItem>
                  <MenuItem value="true">Enabled</MenuItem>
                  <MenuItem value="false">Disabled</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Health status</InputLabel>
                <Select label="Health status" value={filters.status} onChange={updateFilter('status')}>
                  <MenuItem value="">All statuses</MenuItem>
                  <MenuItem value="healthy">Healthy</MenuItem>
                  <MenuItem value="warning">Warning</MenuItem>
                  <MenuItem value="critical">Critical</MenuItem>
                  <MenuItem value="error">Error</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Domain expiry</InputLabel>
                <Select label="Domain expiry" value={filters.expiry} onChange={updateFilter('expiry')}>
                  <MenuItem value="">All expiry dates</MenuItem>
                  <MenuItem value="expired">Expired</MenuItem>
                  <MenuItem value="7">Within 7 days</MenuItem>
                  <MenuItem value="30">Within 30 days</MenuItem>
                  <MenuItem value="90">Within 90 days</MenuItem>
                </Select>
              </FormControl>
              <Button variant="text" onClick={clearFilters} sx={{ minWidth: 110 }}>Clear filters</Button>
            </Stack>
          </Stack>
          <Divider />
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table sx={{ minWidth: 1100 }}>
              <TableHead>
                <TableRow>
                  {['Domain', 'Client / Company', 'Maintenance', 'Registrar', 'Webspace', 'SSL expiry', 'Domain expiry', 'Auto-renew', 'Status', 'Actions'].map((header) => (
                    <TableCell key={header}>{header}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <Stack sx={{ alignItems: 'center', py: 5 }}>
                        <CircularProgress size={28} />
                      </Stack>
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !domains.length && (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <Box sx={{ py: 5, textAlign: 'center' }}>
                        <Typography color="text.secondary">No domains monitored yet. Add domains above to begin.</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
                {domains.map((item) => (
                  <TableRow hover key={item.domain}>
                    <TableCell>
                      <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                        <GlobalOutlined />
                        <Typography variant="subtitle2">{item.domain}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>{item.management?.clientCompany || '—'}</TableCell>
                    <TableCell>{item.management?.maintenanceResponsibility || '—'}</TableCell>
                    <TableCell>{item.management?.registrar || '—'}</TableCell>
                    <TableCell>{item.management?.webspace === null || item.management?.webspace === undefined || item.management?.webspace === '' ? '—' : `${item.management.webspace} GB`}</TableCell>
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
                    <TableCell>{item.management?.autoRenewal ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      <Tooltip title={item.statusMessage || ''}>
                        <Chip size="small" variant="combined" color={statusColors[item.status] || 'secondary'} label={item.status} />
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Actions">
                        <IconButton size="small" onClick={(event) => openActionMenu(event, item.domain)} aria-label={`Actions for ${item.domain}`}>
                          <MoreOutlined />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={pagination.total}
            page={pagination.page}
            onPageChange={(_event, page) => setPagination((current) => ({ ...current, page }))}
            rowsPerPage={pagination.pageSize}
            onRowsPerPageChange={(event) => setPagination({ page: 0, pageSize: Number(event.target.value), total: pagination.total })}
            rowsPerPageOptions={[10, 25, 50, 100]}
            labelRowsPerPage="Rows per page"
          />
        </MainCard>
      </Grid>
      <Menu anchorEl={actionMenuAnchor} open={Boolean(actionMenuAnchor)} onClose={closeActionMenu}>
        <MenuItem onClick={() => { if (actionDomain) openEditDrawer(actionDomain); closeActionMenu(); }}>
          <EditOutlined style={{ marginRight: 8 }} />
          Edit domain
        </MenuItem>
        <MenuItem onClick={() => { if (actionDomain) setSelected(actionDomain); setDetailTab(0); closeActionMenu(); }}>
          <EyeOutlined style={{ marginRight: 8 }} />
          View details
        </MenuItem>
        <MenuItem onClick={() => { if (actionDomain) handleRescan(actionDomain.domain); closeActionMenu(); }} disabled={!actionDomain || scanning || actionDomain.scanEnabled === false}>
          <ReloadOutlined style={{ marginRight: 8 }} />
          Rescan domain
        </MenuItem>
        <MenuItem onClick={() => { if (actionDomain) handleToggleScan(actionDomain.domain, actionDomain.scanEnabled === false); closeActionMenu(); }} disabled={!actionDomain || updatingDomain === actionDomain.domain}>
          <Switch size="small" checked={actionDomain?.scanEnabled !== false} sx={{ mr: 1 }} tabIndex={-1} />
          {actionDomain?.scanEnabled === false ? 'Enable scheduled scan' : 'Disable scheduled scan'}
        </MenuItem>
        <MenuItem onClick={() => { if (actionDomain) handleDelete(actionDomain.domain); closeActionMenu(); }} sx={{ color: 'error.main' }}>
          <DeleteOutlined style={{ marginRight: 8 }} />
          Remove domain
        </MenuItem>
      </Menu>
      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        fullWidth
        maxWidth="xl"
        PaperProps={{ sx: { height: { xs: 'calc(100vh - 32px)', sm: '80vh' }, maxHeight: 'calc(100vh - 32px)' } }}
      >
        <DialogTitle sx={{ position: 'relative', pr: 7 }}>
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
          <IconButton aria-label="Close details" onClick={() => setSelected(null)} sx={{ position: 'absolute', top: 12, right: 12 }}>
            <CloseOutlined />
          </IconButton>
        </DialogTitle>
        <Tabs
          value={detailTab}
          onChange={(_event, value) => setDetailTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Overview" />
          <Tab label="Management" />
          <Tab label="SSL & HTTPS" />
          <Tab label="DNS" />
        </Tabs>
        <DialogContent dividers sx={{ bgcolor: 'grey.50', overflowY: 'auto' }}>{selected && <DomainDetails domain={selected} tab={detailTab} />}</DialogContent>
      </Dialog>
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 560 } } }}
      >
        <Stack sx={{ height: '100%', p: 3, pt: 5, gap: 2 }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h5">{editingDomain ? 'Edit Domain' : 'Add Domain'}</Typography>
            <IconButton aria-label="Close" onClick={() => setDrawerOpen(false)}>
              <CloseOutlined />
            </IconButton>
          </Stack>
          <Divider />
          <Stack sx={{ gap: 2, overflowY: 'auto', pr: 0.5 }}>
            <TextField
              fullWidth
              label="Domain Name"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="example.com"
              helperText="Enter the domain to monitor. This is the only required field."
              required
              disabled={Boolean(editingDomain)}
              autoFocus
            />
            <TextField label="Client / Company" value={managementForm.clientCompany} onChange={(event) => setManagementForm((current) => ({ ...current, clientCompany: event.target.value }))} fullWidth />
            <FormControl fullWidth>
              <InputLabel>Maintenance Responsibility</InputLabel>
              <Select label="Maintenance Responsibility" value={managementForm.maintenanceResponsibility} onChange={(event) => setManagementForm((current) => ({ ...current, maintenanceResponsibility: event.target.value }))}>
                <MenuItem value="Us">Us</MenuItem>
                <MenuItem value="Client">Client</MenuItem>
                <MenuItem value="Shared">Shared</MenuItem>
                <MenuItem value="Third-party vendor">Third-party vendor</MenuItem>
              </Select>
            </FormControl>
            <TextField label="Primary Contact" value={managementForm.primaryContact} onChange={(event) => setManagementForm((current) => ({ ...current, primaryContact: event.target.value }))} placeholder="Name, email, or phone" fullWidth />
            <FormControl fullWidth>
              <InputLabel>Registrar</InputLabel>
              <Select
                label="Registrar"
                value={managementForm.registrarOption}
                onChange={(event) => setManagementForm((current) => ({ ...current, registrarOption: event.target.value, registrar: event.target.value === 'Other / Custom' ? '' : event.target.value }))}
              >
                {popularRegistrars.map((registrar) => <MenuItem key={registrar} value={registrar}>{registrar}</MenuItem>)}
                <MenuItem value="Other / Custom">Other / Custom</MenuItem>
              </Select>
            </FormControl>
            {managementForm.registrarOption === 'Other / Custom' && (
              <TextField label="Custom Registrar" value={managementForm.registrar} onChange={(event) => setManagementForm((current) => ({ ...current, registrar: event.target.value }))} placeholder="Enter registrar name" fullWidth />
            )}
            <TextField label="DNS Managed By" value={managementForm.dnsManagedBy} onChange={(event) => setManagementForm((current) => ({ ...current, dnsManagedBy: event.target.value }))} placeholder="e.g. Cloudflare, Us, Client" fullWidth />
            <Alert severity="info">Registrar, registration date, and expiry date are fetched automatically when the domain registry provides them. Your selected registrar is used as a fallback.</Alert>
            <FormControlLabel
              control={<Switch checked={managementForm.autoRenewal} onChange={(event) => setManagementForm((current) => ({ ...current, autoRenewal: event.target.checked }))} />}
              label="Auto-Renewal Enabled"
            />
            <TextField label="Webspace (GB)" type="number" value={managementForm.webspace} onChange={(event) => setManagementForm((current) => ({ ...current, webspace: event.target.value }))} inputProps={{ min: 0, step: '0.01' }} InputProps={{ endAdornment: <InputAdornment position="end">GB</InputAdornment> }} fullWidth />
            <TextField label="Notes" multiline minRows={3} value={managementForm.notes} onChange={(event) => setManagementForm((current) => ({ ...current, notes: event.target.value }))} fullWidth />
          </Stack>
          <Box sx={{ mt: 'auto' }}>
            <Button fullWidth variant="contained" onClick={handleSaveDomain} disabled={scanning || savingManagement || !input.trim()}>
              {scanning || savingManagement ? <CircularProgress size={22} color="inherit" /> : editingDomain ? 'Save Changes' : 'Save Now'}
            </Button>
          </Box>
        </Stack>
      </Drawer>
    </Grid>
  );
}
