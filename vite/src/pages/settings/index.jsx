import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import MainCard from 'components/MainCard';
import { getSettings, sendTestEmail, updateSettings } from 'api/settings';
import { useAuth } from 'contexts/AuthContext';

const defaults = {
  panelName: 'PM2 Manager',
  refreshInterval: 10,
  defaultLogLines: 500,
  autoRefreshProcesses: true,
  domainScanEnabled: true,
  domainScanIntervalMinutes: 60,
  sslWarningDays: 30,
  sslCriticalDays: 7,
  sslCheckIntervalMinutes: 1440,
  domainWarningDays: 30,
  domainCriticalDays: 7,
  domainScheduleEnabled: true,
  domainScheduleFrequency: 'daily',
  domainScheduleTime: '09:00',
  domainScheduleWeekdays: [1, 3, 5],
  domainScheduleMonthDays: [1],
  domainReportLeadDays: [30, 14, 7, 1],
  domainReportRecipients: '',
  webspaceScheduleEnabled: true,
  webspaceCheckIntervalMinutes: 60,
  webspaceWarningPercent: 80,
  webspaceCriticalPercent: 95,
  applicationDefaultNamespace: 'default',
  applicationDefaultMode: 'fork',
  applicationDefaultInstances: 1,
  applicationDefaultAutorestart: true,
  applicationDefaultWatch: false
};

const weekdays = [{ value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' }];
const monthDays = Array.from({ length: 31 }, (_, index) => index + 1);

export default function SettingsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('settings.manage');
  const [tab, setTab] = useState(0);
  const [settings, setSettings] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    getSettings()
      .then((payload) => setSettings({ ...defaults, ...payload.settings }))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  const update = (key) => (event) => setSettings((current) => ({ ...current, [key]: event.target.value }));
  const updateSwitch = (key) => (event) => setSettings((current) => ({ ...current, [key]: event.target.checked }));
  const toggleNumber = (key, value) => () => setSettings((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value].sort((left, right) => left - right) }));

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      const payload = await updateSettings({
        ...settings,
        refreshInterval: Math.max(5, Number(settings.refreshInterval) || 10),
        defaultLogLines: Math.max(1, Number(settings.defaultLogLines) || 500),
        domainScanIntervalMinutes: Math.max(5, Number(settings.domainScanIntervalMinutes) || 60),
        sslWarningDays: Math.max(1, Number(settings.sslWarningDays) || 30),
        sslCheckIntervalMinutes: Math.max(1, Number(settings.sslCheckIntervalMinutes) || 1440),
        sslCriticalDays: Math.max(1, Number(settings.sslCriticalDays) || 7),
        domainWarningDays: Math.max(1, Number(settings.domainWarningDays) || 30),
        domainCriticalDays: Math.max(1, Number(settings.domainCriticalDays) || 7),
        webspaceCheckIntervalMinutes: Math.max(1, Number(settings.webspaceCheckIntervalMinutes) || 60),
        webspaceWarningPercent: Math.min(1000, Math.max(1, Number(settings.webspaceWarningPercent) || 80)),
        webspaceCriticalPercent: Math.min(1000, Math.max(1, Number(settings.webspaceCriticalPercent) || 95)),
        applicationDefaultInstances: Math.max(1, Number(settings.applicationDefaultInstances) || 1)
      });
      setSettings({ ...defaults, ...payload.settings });
      window.dispatchEvent(new CustomEvent('pm2-settings-updated', { detail: payload.settings }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const testEmail = async () => {
    try {
      setTesting(true);
      setError(null);
      setMessage(null);
      const payload = await sendTestEmail();
      setMessage(payload.message || 'Test email sent successfully.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setTesting(false);
    }
  };

  const saveButton = <Button variant="contained" onClick={save} disabled={loading || saving || !canManage}>{saving ? <CircularProgress size={22} color="inherit" /> : 'Save Changes'}</Button>;

  return <Grid container rowSpacing={3}>
    {error && <Grid size={12}><Alert severity="error" onClose={() => setError(null)}>{error}</Alert></Grid>}
    {message && <Grid size={12}><Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert></Grid>}
    {!canManage && <Grid size={12}><Alert severity="info">You have view-only access to settings.</Alert></Grid>}
    <Grid size={12}><MainCard content={false}><Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" allowScrollButtonsMobile><Tab label="General" /><Tab label="Domain" /><Tab label="SSL" /><Tab label="Application" /></Tabs></MainCard></Grid>
    {tab === 0 && <Grid size={{ xs: 12, md: 6 }}><MainCard title="General"><Stack spacing={2}><TextField label="Panel Name" value={settings.panelName} onChange={update('panelName')} disabled={loading || !canManage} fullWidth /><TextField type="number" label="Refresh Interval (seconds)" value={settings.refreshInterval} onChange={update('refreshInterval')} disabled={loading || !canManage} inputProps={{ min: 5, max: 300 }} fullWidth /><TextField type="number" label="Default Log Lines" value={settings.defaultLogLines} onChange={update('defaultLogLines')} disabled={loading || !canManage} inputProps={{ min: 1, max: 5000 }} fullWidth /><FormControlLabel control={<Switch checked={Boolean(settings.autoRefreshProcesses)} onChange={updateSwitch('autoRefreshProcesses')} disabled={loading || !canManage} />} label="Auto Refresh Processes" />{saveButton}</Stack></MainCard></Grid>}
    {tab === 1 && <Grid size={12}><MainCard title="Website & Hosting"><Stack spacing={2}><FormControlLabel control={<Switch checked={Boolean(settings.domainScheduleEnabled)} onChange={updateSwitch('domainScheduleEnabled')} disabled={loading || !canManage} />} label="Enable scheduled monitoring and reports" /><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><FormControl fullWidth disabled={loading || !canManage}><InputLabel>Frequency</InputLabel><Select label="Frequency" value={settings.domainScheduleFrequency} onChange={update('domainScheduleFrequency')}><MenuItem value="daily">Every day</MenuItem><MenuItem value="weekly">Every week</MenuItem><MenuItem value="monthly">Every month</MenuItem></Select></FormControl><TextField type="time" label="Run time" value={settings.domainScheduleTime} onChange={update('domainScheduleTime')} disabled={loading || !canManage} InputLabelProps={{ shrink: true }} helperText="Uses the server's local time" fullWidth /></Stack>{settings.domainScheduleFrequency === 'weekly' && <Stack><InputLabel>Run on weekdays</InputLabel><Stack direction="row" sx={{ flexWrap: 'wrap' }}>{weekdays.map((day) => <FormControlLabel key={day.value} control={<Checkbox checked={settings.domainScheduleWeekdays.includes(day.value)} onChange={toggleNumber('domainScheduleWeekdays', day.value)} disabled={loading || !canManage} />} label={day.label} />)}</Stack></Stack>}{settings.domainScheduleFrequency === 'monthly' && <FormControl fullWidth disabled={loading || !canManage}><InputLabel>Run on dates</InputLabel><Select multiple label="Run on dates" value={settings.domainScheduleMonthDays} onChange={(event) => setSettings((current) => ({ ...current, domainScheduleMonthDays: event.target.value.map(Number) }))} renderValue={(selected) => [...selected].sort((left, right) => left - right).join(', ')}>{monthDays.map((day) => <MenuItem key={day} value={day}><Checkbox checked={settings.domainScheduleMonthDays.includes(day)} />{day}</MenuItem>)}</Select></FormControl>}{settings.domainScheduleFrequency === 'monthly' && <Alert severity="info">Dates that do not exist in a month are skipped.</Alert>}<TextField label="Report recipients" value={settings.domainReportRecipients} onChange={update('domainReportRecipients')} disabled={loading || !canManage} helperText="Comma-separated email addresses. Defaults to SMTP_USER when empty." fullWidth /><TextField label="Alert days before expiry" value={settings.domainReportLeadDays.join(', ')} onChange={(event) => setSettings((current) => ({ ...current, domainReportLeadDays: event.target.value.split(',').map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0) }))} disabled={loading || !canManage} helperText="Example: 30, 14, 7, 1" fullWidth /><TextField type="number" label="Domain Warning Days" value={settings.domainWarningDays} onChange={update('domainWarningDays')} disabled={loading || !canManage} inputProps={{ min: 1, max: 3650 }} fullWidth /><TextField type="number" label="Domain Critical Days" value={settings.domainCriticalDays} onChange={update('domainCriticalDays')} disabled={loading || !canManage} inputProps={{ min: 1, max: 3650 }} fullWidth /><Divider /><Typography variant="subtitle2">Webspace usage checks</Typography><FormControlLabel control={<Switch checked={Boolean(settings.webspaceScheduleEnabled)} onChange={updateSwitch('webspaceScheduleEnabled')} disabled={loading || !canManage} />} label="Enable scheduled project-directory size checks" /><TextField type="number" label="Check interval (minutes)" value={settings.webspaceCheckIntervalMinutes} onChange={update('webspaceCheckIntervalMinutes')} disabled={loading || !canManage} inputProps={{ min: 1, max: 5000 }} helperText="Only domains with a project directory are checked." fullWidth /><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField type="number" label="Webspace warning (%)" value={settings.webspaceWarningPercent} onChange={update('webspaceWarningPercent')} disabled={loading || !canManage} inputProps={{ min: 1, max: 1000 }} helperText="Send a webspace alert at this usage percentage." fullWidth /><TextField type="number" label="Webspace critical (%)" value={settings.webspaceCriticalPercent} onChange={update('webspaceCriticalPercent')} disabled={loading || !canManage} inputProps={{ min: 1, max: 1000 }} helperText="Marks the webspace alert as critical." fullWidth /></Stack><Stack direction="row" spacing={1}>{saveButton}<Button variant="outlined" onClick={testEmail} disabled={loading || saving || testing || !canManage}>{testing ? <CircularProgress size={22} /> : 'Send Test Email'}</Button></Stack></Stack></MainCard></Grid>}
    {tab === 2 && <Grid size={{ xs: 12, md: 6 }}><MainCard title="SSL monitoring"><Stack spacing={2}><TextField type="number" label="SSL Warning Days" value={settings.sslWarningDays} onChange={update('sslWarningDays')} disabled={loading || !canManage} inputProps={{ min: 1, max: 3650 }} fullWidth /><TextField type="number" label="SSL Critical Days" value={settings.sslCriticalDays} onChange={update('sslCriticalDays')} disabled={loading || !canManage} inputProps={{ min: 1, max: 3650 }} fullWidth /><TextField type="number" label="SSL check interval (minutes)" value={settings.sslCheckIntervalMinutes} onChange={update('sslCheckIntervalMinutes')} disabled={loading || !canManage} inputProps={{ min: 1, max: 5000 }} fullWidth /><Alert severity="info">SSL checks monitor every configured hostname, including the primary domain and subdomains. Certificates at or below the critical threshold are critical.</Alert>{saveButton}</Stack></MainCard></Grid>}
    {tab === 3 && <Grid size={{ xs: 12, md: 6 }}><MainCard title="Application defaults"><Stack spacing={2}><TextField label="Default Namespace" value={settings.applicationDefaultNamespace} onChange={update('applicationDefaultNamespace')} disabled={loading || !canManage} fullWidth /><FormControl fullWidth disabled={loading || !canManage}><InputLabel>Default Execution Mode</InputLabel><Select label="Default Execution Mode" value={settings.applicationDefaultMode} onChange={update('applicationDefaultMode')}><MenuItem value="fork">Fork</MenuItem><MenuItem value="cluster">Cluster</MenuItem></Select></FormControl><TextField type="number" label="Default Instances" value={settings.applicationDefaultInstances} onChange={update('applicationDefaultInstances')} disabled={loading || !canManage} inputProps={{ min: 1, max: 100 }} fullWidth /><FormControlLabel control={<Switch checked={Boolean(settings.applicationDefaultAutorestart)} onChange={updateSwitch('applicationDefaultAutorestart')} disabled={loading || !canManage} />} label="Auto Restart by Default" /><FormControlLabel control={<Switch checked={Boolean(settings.applicationDefaultWatch)} onChange={updateSwitch('applicationDefaultWatch')} disabled={loading || !canManage} />} label="Watch Files by Default" />{saveButton}</Stack></MainCard></Grid>}
  </Grid>;
}
