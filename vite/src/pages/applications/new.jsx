import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import DownOutlined from '@ant-design/icons/DownOutlined';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import MainCard from 'components/MainCard';
import { getSettings } from 'api/settings';
import { analyzeApplication } from 'api/pm2';
import { usePm2 } from 'contexts/Pm2Context';

const initialForm = { name: '', cwd: '', script: '', interpreter: '', mode: 'fork', instances: 1, nodeEnv: '', port: '', args: '', nodeArgs: '', autorestart: true, watch: false, maxMemoryRestart: '', restartDelay: '', maxRestarts: 5 };

function deriveApplicationName(directory) {
  const folder = String(directory || '').trim().replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).pop() || 'application';
  return folder.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').slice(0, 160) || `application-${Date.now()}`;
}

export default function AddApplicationPage() {
  const navigate = useNavigate();
  const { createApplication, notify } = usePm2();
  const [form, setForm] = useState(initialForm);
  const [variables, setVariables] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [approved, setApproved] = useState(false);
  const [guidedStep, setGuidedStep] = useState('directory');
  const update = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    if (['cwd', 'name', 'script'].includes(key)) { setAnalysis(null); setApproved(false); }
    if (key === 'cwd') setGuidedStep('directory');
    if (key === 'name' && guidedStep === 'review') setGuidedStep('name');
  };

  useEffect(() => {
    getSettings().then(({ settings }) => setForm((current) => ({ ...current, mode: settings.applicationDefaultMode || current.mode, instances: settings.applicationDefaultInstances || current.instances, autorestart: settings.applicationDefaultAutorestart !== false, watch: settings.applicationDefaultWatch === true }))).catch(() => {});
  }, []);

  const submit = async () => {
    if (!form.cwd.trim()) { setError('Enter the application working directory.'); return; }
    const name = form.name.trim() || deriveApplicationName(form.cwd);
    try {
      setSubmitting(true);
      setError('');
      const env = Object.fromEntries(variables.filter((variable) => variable.key.trim()).map((variable) => [variable.key.trim(), variable.value]));
      if (form.nodeEnv) env.NODE_ENV = form.nodeEnv;
      if (form.port) env.PORT = form.port;
      await createApplication({ name, cwd: form.cwd.trim(), ...(form.script.trim() ? { script: form.script.trim() } : {}), ...(form.interpreter ? { interpreter: form.interpreter } : {}), mode: form.mode, instances: Number(form.instances) || 1, autorestart: form.autorestart, watch: form.watch, maxRestarts: Math.min(5, Math.max(1, Number(form.maxRestarts) || 5)), ...(form.args.trim() ? { args: form.args.trim() } : {}), ...(form.nodeArgs.trim() ? { nodeArgs: form.nodeArgs.trim() } : {}), ...(form.maxMemoryRestart.trim() ? { maxMemoryRestart: form.maxMemoryRestart.trim() } : {}), ...(form.restartDelay ? { restartDelay: form.restartDelay } : {}), env });
      navigate('/applications');
    } catch (requestError) {
      setError(requestError.message);
      notify(requestError.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const analyze = async () => {
    if (!form.cwd.trim()) { setError('Enter the application working directory first.'); return; }
    try {
      setAnalyzing(true);
      setError('');
      setApproved(false);
      const payload = await analyzeApplication(form.cwd.trim());
      setAnalysis(payload.analysis);
      const recommendation = payload.analysis?.recommended;
      const isPackageCommand = /^(npm|npm\.cmd|yarn|yarn\.cmd|pnpm|pnpm\.cmd)\s/i.test(recommendation?.command || '');
      if (recommendation?.script && !form.script && !isPackageCommand && recommendation.script.toLowerCase() !== 'start') setForm((current) => ({ ...current, script: recommendation.script, interpreter: recommendation.interpreter || current.interpreter }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const continueToName = () => {
    if (!form.cwd.trim()) { setError('Enter the application directory first.'); return; }
    setError('');
    setGuidedStep('name');
  };

  const continueToAnalysis = () => {
    if (!form.name.trim()) { setError('Enter a name for this application.'); return; }
    setError('');
    setGuidedStep('review');
  };

  const updateVariable = (index, key) => (event) => setVariables((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: event.target.value } : item));

  return <Grid container rowSpacing={3}>
    {error && <Grid size={12}><Alert severity="error">{error}</Alert></Grid>}
    <Grid size={12}><Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3, bgcolor: 'primary.lighter', borderColor: 'primary.light' }}><Stack spacing={2.5}><Stack direction="row" spacing={1.5} alignItems="center"><Avatar sx={{ bgcolor: 'primary.main', width: 38, height: 38 }}>AI</Avatar><Box><Typography variant="subtitle1" fontWeight={600}>Deployment assistant</Typography><Typography variant="body2" color="text.secondary">I’ll inspect the project and prepare it for PM2.</Typography></Box></Stack><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap><Typography variant="caption" color={guidedStep === 'directory' ? 'primary.main' : 'text.secondary'} fontWeight={guidedStep === 'directory' ? 700 : 400}>1. Directory</Typography><Typography variant="caption" color="text.disabled">→</Typography><Typography variant="caption" color={guidedStep === 'name' ? 'primary.main' : 'text.secondary'} fontWeight={guidedStep === 'name' ? 700 : 400}>2. Name</Typography><Typography variant="caption" color="text.disabled">→</Typography><Typography variant="caption" color={guidedStep === 'review' ? 'primary.main' : 'text.secondary'} fontWeight={guidedStep === 'review' ? 700 : 400}>3. Analyze</Typography></Stack>{guidedStep === 'directory' && <Stack spacing={1.5}><Typography variant="h6">Which application do you want to deploy?</Typography><TextField required label="Application directory" placeholder="C:\\apps\\my-app" value={form.cwd} onChange={update('cwd')} helperText="Use the folder that contains the application package.json or start file." fullWidth /><Button variant="contained" onClick={continueToName} disabled={!form.cwd.trim()}>Next question</Button></Stack>}{guidedStep === 'name' && <Stack spacing={1.5}><Typography variant="h6">What name do you want to keep for this application?</Typography><Typography variant="body2" color="text.secondary">This name will appear in the application list and PM2.</Typography><TextField required autoFocus label="Application name" placeholder={deriveApplicationName(form.cwd)} value={form.name} onChange={update('name')} fullWidth /><Stack direction="row" spacing={1}><Button onClick={() => setGuidedStep('directory')}>Back</Button><Button variant="contained" onClick={continueToAnalysis} disabled={!form.name.trim()}>Continue to analysis</Button></Stack></Stack>}{guidedStep === 'review' && <Stack spacing={1.5}><Typography variant="h6">Ready to analyze this application?</Typography><Typography variant="body2" color="text.secondary"><strong>{form.name}</strong> · {form.cwd}</Typography><Stack direction="row" spacing={1}><Button onClick={() => setGuidedStep('name')}>Edit details</Button><Button variant="contained" onClick={analyze} disabled={analyzing || submitting}>{analyzing ? <><CircularProgress size={20} sx={{ mr: 1 }} />Analyzing…</> : analysis ? 'Analyze again' : 'Analyze project'}</Button></Stack></Stack>}</Stack></Paper></Grid>
    {analysis && <Grid size={12}><MainCard title="Project analysis"><Stack spacing={1.5}><Alert severity={analysis.ready ? 'success' : 'warning'}>{analysis.summary}</Alert><Typography variant="body2"><strong>Detected:</strong> {analysis.project?.framework || 'Unknown'} · {analysis.project?.packageManager || 'No package manager'} · <strong>Start:</strong> {analysis.recommended?.command || 'Not found'}</Typography>{analysis.requiredChanges?.length > 0 && <Stack spacing={1}><Typography variant="subtitle2">Changes required before start</Typography>{analysis.requiredChanges.map((change, index) => <Alert severity="error" key={`${change.file}-${index}`}><strong>{change.file}:</strong> {change.reason}{change.suggestion ? ` ${change.suggestion}` : ''}</Alert>)}</Stack>}{analysis.ready && !approved && <Button variant="contained" onClick={() => setApproved(true)}>Approve Analysis</Button>}{approved && <Alert severity="success">Analysis approved. The Start Application button is now enabled.</Alert>}</Stack></MainCard></Grid>}
    <Grid size={12}><Accordion><AccordionSummary expandIcon={<DownOutlined />}>Advanced settings</AccordionSummary><AccordionDetails><Grid container spacing={2}><Grid size={{ xs: 12, md: 6 }}><TextField label="Script / Start File (optional)" placeholder="Auto-detect package.json start" value={form.script} onChange={update('script')} fullWidth /></Grid><Grid size={{ xs: 12, md: 6 }}><FormControl fullWidth><InputLabel>Interpreter</InputLabel><Select label="Interpreter" value={form.interpreter} onChange={update('interpreter')}><MenuItem value="">Auto-detect</MenuItem><MenuItem value="node">Node.js</MenuItem><MenuItem value="bun">Bun</MenuItem><MenuItem value="python">Python</MenuItem><MenuItem value="none">None</MenuItem></Select></FormControl></Grid><Grid size={{ xs: 12, md: 4 }}><FormControl fullWidth><InputLabel>Execution Mode</InputLabel><Select label="Execution Mode" value={form.mode} onChange={update('mode')}><MenuItem value="fork">Fork</MenuItem><MenuItem value="cluster">Cluster</MenuItem></Select></FormControl></Grid><Grid size={{ xs: 12, md: 4 }}><TextField type="number" label="Instances" value={form.instances} onChange={update('instances')} inputProps={{ min: 1, max: 100 }} fullWidth /></Grid><Grid size={{ xs: 12, md: 4 }}><TextField label="Port (optional)" placeholder="Auto-detect" value={form.port} onChange={update('port')} fullWidth /></Grid><Grid size={{ xs: 12, md: 4 }}><TextField label="NODE_ENV (optional)" value={form.nodeEnv} onChange={update('nodeEnv')} fullWidth /></Grid><Grid size={{ xs: 12, md: 4 }}><TextField label="Arguments" placeholder="start -p 3000" value={form.args} onChange={update('args')} fullWidth /></Grid><Grid size={{ xs: 12, md: 4 }}><TextField label="Node Arguments" value={form.nodeArgs} onChange={update('nodeArgs')} fullWidth /></Grid><Grid size={{ xs: 12, md: 4 }}><TextField type="number" label="Max restart attempts" value={form.maxRestarts} onChange={update('maxRestarts')} inputProps={{ min: 1, max: 5 }} helperText="Safety limit: maximum 5" fullWidth /></Grid><Grid size={{ xs: 12, md: 4 }}><TextField label="Max Memory Restart" placeholder="500M" value={form.maxMemoryRestart} onChange={update('maxMemoryRestart')} fullWidth /></Grid><Grid size={{ xs: 12, md: 4 }}><TextField label="Restart Delay" placeholder="Milliseconds" value={form.restartDelay} onChange={update('restartDelay')} fullWidth /></Grid><Grid size={12}><FormControlLabel control={<Switch checked={form.autorestart} onChange={(event) => setForm((current) => ({ ...current, autorestart: event.target.checked }))} />} label="Auto Restart" /><FormControlLabel control={<Switch checked={form.watch} onChange={(event) => setForm((current) => ({ ...current, watch: event.target.checked }))} />} label="Watch Files" /></Grid><Grid size={12}><MainCard title="Additional environment variables" content={false}><Table><TableHead><TableRow><TableCell>KEY</TableCell><TableCell>VALUE</TableCell><TableCell align="right">DELETE</TableCell></TableRow></TableHead><TableBody>{variables.map((variable, index) => <TableRow key={index}><TableCell><TextField size="small" value={variable.key} onChange={updateVariable(index, 'key')} /></TableCell><TableCell><TextField size="small" value={variable.value} onChange={updateVariable(index, 'value')} /></TableCell><TableCell align="right"><IconButton aria-label="Delete variable" onClick={() => setVariables((current) => current.filter((_, itemIndex) => itemIndex !== index))}><DeleteOutlined /></IconButton></TableCell></TableRow>)}</TableBody></Table><Button sx={{ m: 2 }} size="small" startIcon={<PlusOutlined />} onClick={() => setVariables((current) => [...current, { key: '', value: '' }])}>Add Variable</Button></MainCard></Grid></Grid></AccordionDetails></Accordion></Grid>
    <Grid size={12}><Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}><Button onClick={() => navigate('/applications')}>Cancel</Button><Button variant="contained" onClick={submit} disabled={submitting || !approved}>{submitting ? <><CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />Starting…</> : 'Start Application'}</Button></Stack></Grid>
  </Grid>;
}
