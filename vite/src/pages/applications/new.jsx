import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import MainCard from 'components/MainCard';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Alert from '@mui/material/Alert';
import ExpandMoreOutlined from '@ant-design/icons/DownOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import { usePm2 } from 'contexts/Pm2Context';

export default function AddApplicationPage() {
  const navigate = useNavigate();
  const { createApplication, notify } = usePm2();
  const [form, setForm] = useState({ name: '', script: '', cwd: '', interpreter: 'node', mode: 'fork', instances: 1, environment: 'production', nodeEnv: 'production', port: '5001', args: '', nodeArgs: '' });
  const [variables, setVariables] = useState([{ key: 'NODE_ENV', value: 'production' }, { key: 'PORT', value: '5001' }, { key: 'DATABASE_URL', value: '********' }]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async () => {
    if (!form.name || !form.cwd) { setError('Please complete all required fields.'); return; }
    try {
      setSubmitting(true);
      setError('');
      const env = Object.fromEntries(variables.filter((variable) => variable.key.trim()).map((variable) => [variable.key.trim(), variable.value]));
      if (form.nodeEnv) env.NODE_ENV = form.nodeEnv;
      if (form.port) env.PORT = form.port;
      await createApplication({
        ...form,
        env
      });
      navigate('/applications');
    } catch (requestError) {
      setError(requestError.message);
      notify(requestError.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };
  const updateVariable = (index, key) => (event) => setVariables((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: event.target.value } : item));
  return <Grid container rowSpacing={3}>
    {error && <Grid size={12}><Alert severity="error">{error}</Alert></Grid>}
    <Grid size={12}><MainCard title="Basic Information"><Grid container spacing={2}><Grid size={{ xs: 12, md: 4 }}><TextField required label="Application Name" placeholder="gymfox-api" value={form.name} onChange={update('name')} fullWidth /></Grid><Grid size={{ xs: 12, md: 4 }}><TextField label="Script / Start File" placeholder="Leave blank to use package.json start" value={form.script} onChange={update('script')} fullWidth /></Grid><Grid size={{ xs: 12, md: 4 }}><TextField required label="Working Directory" placeholder="C:\\apps\\gymfox-api" value={form.cwd} onChange={update('cwd')} fullWidth /></Grid></Grid></MainCard></Grid>
    <Grid size={{ xs: 12, md: 6 }}><MainCard title="Runtime"><Stack spacing={2}><FormControl fullWidth><InputLabel>Interpreter</InputLabel><Select label="Interpreter" value={form.interpreter} onChange={update('interpreter')}><MenuItem value="node">Node.js</MenuItem><MenuItem value="bun">Bun</MenuItem><MenuItem value="python">Python</MenuItem><MenuItem value="none">None</MenuItem></Select></FormControl><FormControl fullWidth><InputLabel>Execution Mode</InputLabel><Select label="Execution Mode" value={form.mode} onChange={update('mode')}><MenuItem value="fork">Fork</MenuItem><MenuItem value="cluster">Cluster</MenuItem></Select></FormControl><TextField type="number" label="Instances" value={form.instances} onChange={update('instances')} fullWidth /></Stack></MainCard></Grid>
    <Grid size={{ xs: 12, md: 6 }}><MainCard title="Environment"><Stack spacing={2}><FormControl fullWidth><InputLabel>Environment</InputLabel><Select label="Environment" value={form.environment} onChange={update('environment')}><MenuItem value="production">Production</MenuItem><MenuItem value="development">Development</MenuItem><MenuItem value="staging">Staging</MenuItem></Select></FormControl><TextField label="Node Environment (NODE_ENV)" value={form.nodeEnv} onChange={update('nodeEnv')} fullWidth /><TextField label="Port" placeholder="5001" value={form.port} onChange={update('port')} fullWidth /></Stack></MainCard></Grid>
    <Grid size={12}><Accordion><AccordionSummary expandIcon={<ExpandMoreOutlined />}>Advanced Options</AccordionSummary><AccordionDetails><Grid container spacing={2}><Grid size={{ xs: 12, sm: 6 }}><FormControlLabel control={<Switch defaultChecked />} label="Auto Restart" /><FormControlLabel control={<Switch />} label="Watch" /></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField label="Max Memory Restart" placeholder="500M" fullWidth sx={{ mb: 2 }} /><TextField label="Restart Delay" placeholder="1000 ms" fullWidth /></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField label="Arguments" value={form.args} onChange={update('args')} placeholder="For Next.js: start -p 3000" fullWidth /></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField label="Node Arguments" value={form.nodeArgs} onChange={update('nodeArgs')} fullWidth /></Grid></Grid></AccordionDetails></Accordion></Grid>
    <Grid size={12}><MainCard title="Environment Variables" content={false}><Table><TableHead><TableRow><TableCell>KEY</TableCell><TableCell>VALUE</TableCell><TableCell align="right">DELETE</TableCell></TableRow></TableHead><TableBody>{variables.map((variable, index) => <TableRow key={index}><TableCell><TextField size="small" value={variable.key} onChange={updateVariable(index, 'key')} /></TableCell><TableCell><TextField size="small" value={variable.value} onChange={updateVariable(index, 'value')} /></TableCell><TableCell align="right"><IconButton aria-label="Delete variable" onClick={() => setVariables((current) => current.filter((_, itemIndex) => itemIndex !== index))}><DeleteOutlined /></IconButton></TableCell></TableRow>)}</TableBody></Table><Button sx={{ m: 2 }} size="small" startIcon={<PlusOutlined />} onClick={() => setVariables((current) => [...current, { key: '', value: '' }])}>Add Variable</Button></MainCard></Grid>
    <Grid size={12}><Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}><Button component="button" onClick={() => navigate('/applications')}>Cancel</Button><Button variant="contained" onClick={submit} disabled={submitting}>{submitting ? 'Starting…' : 'Start Application'}</Button></Stack></Grid>
  </Grid>;
}
