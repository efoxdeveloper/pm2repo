import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import EditOutlined from '@ant-design/icons/EditOutlined';
import MainCard from 'components/MainCard';
import { checkSslCertificates, deleteSslCertificate, getDomains, getSslCertificates, saveSslCertificate } from 'api/domains';
import { useAuth } from 'contexts/AuthContext';

const emptyForm = { domain: '', hostname: '', port: 443, scanEnabled: true };
const statusColors = { healthy: 'success', warning: 'warning', critical: 'error', error: 'error' };

function date(value) {
  if (!value) return 'Not checked';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? 'Not checked' : parsed.toLocaleString();
}

function days(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value) < 0 ? `${Math.abs(Number(value))} days overdue` : `${value} days`;
}

export default function SslCertificatesPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('domains.manage');
  const [hosts, setHosts] = useState([]);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    try {
      setLoading(true);
      const [sslPayload, domainPayload] = await Promise.all([getSslCertificates(), getDomains({ page: 1, pageSize: 100 })]);
      setHosts(sslPayload.hosts || []);
      setDomains(domainPayload.domains || []);
      setError('');
    } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { const domain = domains[0]?.domain || ''; setForm({ ...emptyForm, domain, hostname: domain }); setDialog('add'); };
  const openEdit = (item) => { setForm({ domain: item.domain, hostname: item.hostname, port: item.port, scanEnabled: item.scanEnabled }); setDialog(item); };
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const save = async () => {
    try { setBusy(true); await saveSslCertificate({ ...form, port: Number(form.port) }, dialog === 'add' ? null : dialog.id); setDialog(null); await load(); }
    catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  };
  const remove = async (item) => {
    if (!window.confirm(`Remove SSL monitoring for ${item.hostname}?`)) return;
    try { setBusy(true); await deleteSslCertificate(item.id); await load(); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  };
  const check = async () => {
    try { setBusy(true); await checkSslCertificates(); await load(); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  };

  if (!hasPermission('domains.view')) return <Alert severity="error">You do not have permission to view SSL certificates.</Alert>;
  return (
    <Grid container spacing={2.75}>
      <Grid size={12}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1 }}>
          <BoxTitle />
          <Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<ReloadOutlined />} onClick={check} disabled={busy}>Check all</Button>{canManage && <Button variant="contained" startIcon={<PlusOutlined />} onClick={openAdd} disabled={!domains.length}>Add SSL host</Button>}</Stack>
        </Stack>
      </Grid>
      {error && <Grid size={12}><Alert severity="error" onClose={() => setError('')}>{error}</Alert></Grid>}
      <Grid size={12}><MainCard title={loading ? 'Loading SSL hosts…' : `${hosts.length} monitored SSL host${hosts.length === 1 ? '' : 's'}`} content={false}>
        <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Hostname</TableCell><TableCell>Parent domain</TableCell><TableCell>Status</TableCell><TableCell>Certificate expiry</TableCell><TableCell>Issuer</TableCell><TableCell>Last checked</TableCell>{canManage && <TableCell align="right">Actions</TableCell>}</TableRow></TableHead><TableBody>
          {!hosts.length && <TableRow><TableCell colSpan={canManage ? 7 : 6}><Typography color="text.secondary" sx={{ p: 2 }}>No SSL hosts configured.</Typography></TableCell></TableRow>}
          {hosts.map((item) => <TableRow key={item.id} hover><TableCell><Typography variant="subtitle2">{item.hostname}{item.port !== 443 ? `:${item.port}` : ''}</Typography></TableCell><TableCell>{item.domain}</TableCell><TableCell><Chip size="small" variant="combined" color={statusColors[item.status] || 'default'} label={item.status || 'unknown'} /></TableCell><TableCell>{days(item.ssl?.daysRemaining)}</TableCell><TableCell>{item.ssl?.issuer?.O || item.ssl?.issuer?.CN || '—'}</TableCell><TableCell>{date(item.scannedAt)}</TableCell>{canManage && <TableCell align="right"><Button size="small" startIcon={<EditOutlined />} onClick={() => openEdit(item)}>Edit</Button><Button size="small" color="error" startIcon={<DeleteOutlined />} onClick={() => remove(item)}>Remove</Button></TableCell>}</TableRow>)}
        </TableBody></Table></TableContainer>
      </MainCard></Grid>
      <Dialog open={Boolean(dialog)} onClose={() => !busy && setDialog(null)} fullWidth maxWidth="sm"><DialogTitle>{dialog === 'add' ? 'Add SSL host' : 'Edit SSL host'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><FormControl fullWidth><InputLabel>Parent domain</InputLabel><Select label="Parent domain" value={form.domain} onChange={update('domain')}>{domains.map((item) => <MenuItem key={item.domain} value={item.domain}>{item.domain}</MenuItem>)}</Select></FormControl><TextField label="Hostname" value={form.hostname} onChange={update('hostname')} helperText="Use the primary domain or a subdomain under it." fullWidth /><TextField label="TLS port" type="number" value={form.port} onChange={update('port')} inputProps={{ min: 1, max: 65535 }} fullWidth /><FormControlLabel control={<Switch checked={Boolean(form.scanEnabled)} onChange={(event) => setForm((current) => ({ ...current, scanEnabled: event.target.checked }))} />} label="Include in scheduled SSL checks" /></Stack></DialogContent><DialogActions><Button onClick={() => setDialog(null)} disabled={busy}>Cancel</Button><Button variant="contained" onClick={save} disabled={busy || !form.domain || !form.hostname}>{busy ? <CircularProgress size={20} /> : 'Save host'}</Button></DialogActions></Dialog>
    </Grid>
  );
}

function BoxTitle() { return <Stack><Typography variant="h5">SSL Certificates</Typography><Typography variant="body2" color="text.secondary">Monitor certificates for primary domains and every configured subdomain.</Typography></Stack>; }
