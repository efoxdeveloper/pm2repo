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
import { checkWebspaceDirectories, deleteWebspaceDirectory, getDomains, getWebspaceDirectories, saveWebspaceDirectory } from 'api/domains';
import { useAuth } from 'contexts/AuthContext';

const emptyForm = { domain: '', label: '', directory: '', allocatedWebspace: '', scanEnabled: true };
const statusColors = { healthy: 'success', warning: 'warning', error: 'error' };
function format(value) { const number = Number(value); return Number.isFinite(number) ? `${number.toFixed(2)} GB` : '—'; }
function date(value) { if (!value) return 'Not checked'; const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? 'Not checked' : parsed.toLocaleString(); }

export default function WebspacePage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('domains.manage');
  const [directories, setDirectories] = useState([]); const [domains, setDomains] = useState([]); const [summary, setSummary] = useState({ total: 0, tracked: 0, totalAllocatedWebspace: 0, totalUsedWebspace: 0, errors: 0 });
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [dialog, setDialog] = useState(null); const [form, setForm] = useState(emptyForm);
  const load = async () => { try { setLoading(true); const [space, domainPayload] = await Promise.all([getWebspaceDirectories(), getDomains({ page: 1, pageSize: 100 })]); setDirectories(space.directories || []); setSummary({ ...summary, ...(space.summary || {}) }); setDomains(domainPayload.domains || []); setError(''); } catch (requestError) { setError(requestError.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const openAdd = () => { setForm({ ...emptyForm, domain: domains[0]?.domain || '' }); setDialog('add'); };
  const openEdit = (item) => { setForm({ domain: item.domain, label: item.label, directory: item.directory, allocatedWebspace: item.allocatedWebspace ?? '', scanEnabled: item.scanEnabled }); setDialog(item); };
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const save = async () => { try { setBusy(true); await saveWebspaceDirectory({ ...form, allocatedWebspace: form.allocatedWebspace === '' ? null : Number(form.allocatedWebspace) }, dialog === 'add' ? null : dialog.id); setDialog(null); await load(); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } };
  const remove = async (item) => { if (!window.confirm(`Remove ${item.directory} from webspace monitoring?`)) return; try { setBusy(true); await deleteWebspaceDirectory(item.id); await load(); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } };
  const check = async () => { try { setBusy(true); await checkWebspaceDirectories(); await load(); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } };
  if (!hasPermission('domains.view')) return <Alert severity="error">You do not have permission to view webspace.</Alert>;
  return <Grid container spacing={2.75}>
    <Grid size={12}><Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1 }}><Stack><Typography variant="h5">Webspace</Typography><Typography variant="body2" color="text.secondary">Track multiple project directories and their used / allocated storage.</Typography></Stack><Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<ReloadOutlined />} onClick={check} disabled={busy}>Check all</Button>{canManage && <Button variant="contained" startIcon={<PlusOutlined />} onClick={openAdd} disabled={!domains.length}>Add directory</Button>}</Stack></Stack></Grid>
    {error && <Grid size={12}><Alert severity="error" onClose={() => setError('')}>{error}</Alert></Grid>}
    <Grid size={{ xs: 12, sm: 4 }}><MainCard><Typography color="text.secondary">Directories</Typography><Typography variant="h4">{loading ? '…' : summary.total}</Typography></MainCard></Grid><Grid size={{ xs: 12, sm: 4 }}><MainCard><Typography color="text.secondary">Used / allocated</Typography><Typography variant="h4">{format(summary.totalUsedWebspace)} / {format(summary.totalAllocatedWebspace)}</Typography></MainCard></Grid><Grid size={{ xs: 12, sm: 4 }}><MainCard><Typography color="text.secondary">Check errors</Typography><Typography variant="h4" color={summary.errors ? 'error.main' : 'success.main'}>{summary.errors}</Typography></MainCard></Grid>
    <Grid size={12}><MainCard title="Directory inventory" content={false}><TableContainer><Table size="small"><TableHead><TableRow><TableCell>Domain</TableCell><TableCell>Directory</TableCell><TableCell>Used / allocated</TableCell><TableCell>Status</TableCell><TableCell>Last checked</TableCell>{canManage && <TableCell align="right">Actions</TableCell>}</TableRow></TableHead><TableBody>{!directories.length && <TableRow><TableCell colSpan={canManage ? 6 : 5}><Typography color="text.secondary" sx={{ p: 2 }}>No webspace directories configured.</Typography></TableCell></TableRow>}{directories.map((item) => <TableRow key={item.id} hover><TableCell><Typography variant="subtitle2">{item.domain}</Typography><Typography variant="caption" color="text.secondary">{item.label}</Typography></TableCell><TableCell sx={{ maxWidth: 360, wordBreak: 'break-all' }}>{item.directory}</TableCell><TableCell><Typography variant="subtitle2">{format(item.usedWebspace)} / {format(item.allocatedWebspace)}</Typography></TableCell><TableCell><Chip size="small" variant="combined" color={statusColors[item.checkStatus] || 'default'} label={item.checkStatus || 'unknown'} /></TableCell><TableCell>{date(item.checkedAt)}</TableCell>{canManage && <TableCell align="right"><Button size="small" startIcon={<EditOutlined />} onClick={() => openEdit(item)}>Edit</Button><Button size="small" color="error" startIcon={<DeleteOutlined />} onClick={() => remove(item)}>Remove</Button></TableCell>}</TableRow>)}</TableBody></Table></TableContainer></MainCard></Grid>
    <Dialog open={Boolean(dialog)} onClose={() => !busy && setDialog(null)} fullWidth maxWidth="sm"><DialogTitle>{dialog === 'add' ? 'Add webspace directories' : 'Edit webspace directory'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><FormControl fullWidth><InputLabel>Domain</InputLabel><Select label="Domain" value={form.domain} onChange={update('domain')}>{domains.map((item) => <MenuItem key={item.domain} value={item.domain}>{item.domain}</MenuItem>)}</Select></FormControl><TextField label="Label" value={form.label} onChange={update('label')} helperText={dialog === 'add' ? 'Optional for bulk entry; labels default to each directory name.' : 'Example: Frontend, uploads, or API project'} fullWidth /><TextField label={dialog === 'add' ? 'Project directories (comma-separated)' : 'Project directory'} value={form.directory} onChange={update('directory')} multiline={dialog === 'add'} minRows={dialog === 'add' ? 3 : undefined} placeholder={dialog === 'add' ? 'D:\\sites\\example.com, D:\\sites\\blog.example.com' : 'D:\\sites\\example.com'} helperText={dialog === 'add' ? 'Enter one or more absolute paths separated by commas. Each path is monitored independently.' : 'Absolute path on the monitoring server'} fullWidth /><TextField label="Allocated webspace (GB)" type="number" value={form.allocatedWebspace} onChange={update('allocatedWebspace')} inputProps={{ min: 0, step: 0.01 }} helperText="This quota is applied to every directory in a bulk entry; leave blank if no quota is assigned" fullWidth /><FormControlLabel control={<Switch checked={Boolean(form.scanEnabled)} onChange={(event) => setForm((current) => ({ ...current, scanEnabled: event.target.checked }))} />} label="Include in scheduled checks" /></Stack></DialogContent><DialogActions><Button onClick={() => setDialog(null)} disabled={busy}>Cancel</Button><Button variant="contained" onClick={save} disabled={busy || !form.domain || !form.directory}>{busy ? <CircularProgress size={20} /> : dialog === 'add' ? 'Save directories' : 'Save directory'}</Button></DialogActions></Dialog>
  </Grid>;
}
