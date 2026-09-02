import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import MainCard from 'components/MainCard';
import ApplicationTable from 'components/pm2/ApplicationTable';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { usePm2 } from 'contexts/Pm2Context';

export default function ApplicationsPage() {
  const { applications } = usePm2();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [mode, setMode] = useState('all');
  const filtered = useMemo(() => applications.filter((application) => `${application.displayName} ${application.name}`.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || application.status === status) && (mode === 'all' || application.mode === mode)), [applications, mode, query, status]);
  return (
    <Grid container rowSpacing={3}>
      <Grid size={12}><Stack direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 2 }}><Typography variant="body2" color="text.secondary">Manage applications running through PM2.</Typography><Button component={Link} to="/applications/new" variant="contained" startIcon={<PlusOutlined />}>Add Application</Button></Stack></Grid>
      <Grid size={12}><MainCard content={false}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ p: 2 }}><TextField size="small" placeholder="Search applications..." value={query} onChange={(event) => setQuery(event.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchOutlined /></InputAdornment> } }} /><FormControl size="small" sx={{ minWidth: 150 }}><InputLabel>Status</InputLabel><Select label="Status" value={status} onChange={(event) => setStatus(event.target.value)}><MenuItem value="all">All</MenuItem><MenuItem value="online">Online</MenuItem><MenuItem value="stopped">Stopped</MenuItem><MenuItem value="errored">Errored</MenuItem><MenuItem value="launching">Launching</MenuItem></Select></FormControl><FormControl size="small" sx={{ minWidth: 130 }}><InputLabel>Mode</InputLabel><Select label="Mode" value={mode} onChange={(event) => setMode(event.target.value)}><MenuItem value="all">All</MenuItem><MenuItem value="fork">Fork</MenuItem><MenuItem value="cluster">Cluster</MenuItem></Select></FormControl></Stack><ApplicationTable applications={filtered} /></MainCard></Grid>
    </Grid>
  );
}
