import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import DownloadOutlined from '@ant-design/icons/DownloadOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import PauseOutlined from '@ant-design/icons/PauseOutlined';
import { usePm2 } from 'contexts/Pm2Context';

export default function LogsViewer({ entries, terminal = false }) {
  const { notify } = usePm2();
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const [cleared, setCleared] = useState(false);
  const filtered = useMemo(() => entries.filter((entry) => (type === 'all' || entry.type === type) && `${entry.message} ${entry.application}`.toLowerCase().includes(query.toLowerCase())), [entries, query, type]);

  return (
    <>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} sx={{ p: 2, alignItems: { lg: 'center' }, justifyContent: 'space-between' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
          <ToggleButtonGroup size="small" exclusive value={type} onChange={(_, value) => value && setType(value)}>
            <ToggleButton value="all">All</ToggleButton><ToggleButton value="info">Output</ToggleButton><ToggleButton value="error">Error</ToggleButton>
          </ToggleButtonGroup>
          <TextField size="small" placeholder="Search logs" value={query} onChange={(event) => setQuery(event.target.value)} />
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControlLabel control={<Switch size="small" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} />} label="Auto Scroll" />
          <Button size="small" startIcon={<PauseOutlined />} onClick={() => setPaused((value) => !value)}>{paused ? 'Resume' : 'Pause'}</Button>
          <Button size="small" startIcon={<DeleteOutlined />} onClick={() => { setCleared(true); notify('Logs cleared for this view.'); }}>Clear</Button>
          <Button size="small" startIcon={<DownloadOutlined />} onClick={() => notify('Log download prepared.')}>Download</Button>
        </Stack>
      </Stack>
      <Box sx={{ mx: 2, mb: 2, p: 2, minHeight: 220, maxHeight: 360, overflow: 'auto', bgcolor: 'grey.50', border: 1, borderColor: 'divider' }}>
        {cleared || !filtered.length ? <Typography variant="body2" color="text.secondary">No logs available.</Typography> : filtered.map((entry, index) => (
          <Typography key={`${entry.timestamp}-${index}`} component="div" variant="body2" sx={{ fontFamily: 'monospace', lineHeight: 1.9, color: entry.type === 'error' ? 'error.main' : 'text.primary' }}>
            {terminal ? `${entry.timestamp} ${entry.type.toUpperCase()} ${entry.message}` : `${entry.timestamp}  ${entry.application}  ${entry.type.toUpperCase()}  ${entry.message}`}
          </Typography>
        ))}
      </Box>
    </>
  );
}

LogsViewer.propTypes = { entries: PropTypes.array, terminal: PropTypes.bool };
