import Grid from '@mui/material/Grid';
import MainCard from 'components/MainCard';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import { usePm2 } from 'contexts/Pm2Context';

export default function SettingsPage() {
  const { notify } = usePm2();
  return <Grid container rowSpacing={3}><Grid size={{ xs: 12, md: 6 }}><MainCard title="General"><Stack spacing={2}><TextField label="Panel Name" defaultValue="PM2 Manager" fullWidth /><TextField label="Refresh Interval" defaultValue="5 seconds" fullWidth /><TextField label="Default Log Lines" defaultValue="500" fullWidth /><Button variant="contained" onClick={() => notify('Settings saved successfully.')}>Save Changes</Button></Stack></MainCard></Grid><Grid size={{ xs: 12, md: 6 }}><MainCard title="Appearance"><Typography variant="body2" color="text.secondary">Appearance preferences are managed by the Mantis theme configuration.</Typography></MainCard><MainCard title="PM2" sx={{ mt: 3 }}><Stack spacing={2}><TextField label="PM2 Home" defaultValue="C:\\Users\\Administrator.pm2" fullWidth /><TextField label="Default Namespace" defaultValue="default" fullWidth /><FormControlLabel control={<Switch defaultChecked />} label="Auto Refresh Processes" /><Button variant="contained" onClick={() => notify('PM2 settings saved successfully.')}>Save Changes</Button></Stack></MainCard></Grid></Grid>;
}
