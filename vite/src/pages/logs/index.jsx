import { useMemo, useState } from 'react';
import Grid from '@mui/material/Grid';
import MainCard from 'components/MainCard';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import LogsViewer from 'components/pm2/LogsViewer';
import { usePm2 } from 'contexts/Pm2Context';

export default function LogsPage() {
  const { applications, logs } = usePm2();
  const [application, setApplication] = useState('all');
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => logs.filter((entry) => (application === 'all' || entry.application === application) && (type === 'all' || entry.type === type) && `${entry.application} ${entry.message}`.toLowerCase().includes(query.toLowerCase())), [application, query, type]);
  return <Grid container rowSpacing={3}><Grid size={12}><MainCard title="Log Viewer" subheader="Review output and error logs from managed applications" content={false}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ p: 2 }}><FormControl size="small" sx={{ minWidth: 200 }}><InputLabel>Application</InputLabel><Select label="Application" value={application} onChange={(event) => setApplication(event.target.value)}><MenuItem value="all">All Applications</MenuItem>{applications.map((item) => <MenuItem key={item.id} value={item.name}>{item.displayName}</MenuItem>)}</Select></FormControl><FormControl size="small" sx={{ minWidth: 140 }}><InputLabel>Log Type</InputLabel><Select label="Log Type" value={type} onChange={(event) => setType(event.target.value)}><MenuItem value="all">All</MenuItem><MenuItem value="info">Output</MenuItem><MenuItem value="error">Error</MenuItem></Select></FormControl><TextField size="small" placeholder="Search Logs" value={query} onChange={(event) => setQuery(event.target.value)} /></Stack><LogsViewer entries={filtered} /></MainCard></Grid></Grid>;
}
