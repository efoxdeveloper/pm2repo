import { useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import UploadOutlined from '@ant-design/icons/UploadOutlined';
import { importDomains } from 'api/domains';

const importFields = [
  { key: 'domain', label: 'Domain name', required: true, aliases: ['domain', 'domain name', 'website', 'website url', 'url', 'hostname'] },
  { key: 'clientCompany', label: 'Client / Company', aliases: ['client', 'client company', 'company', 'customer'] },
  { key: 'maintenanceResponsibility', label: 'Maintenance responsibility', aliases: ['maintenance', 'maintenance responsibility', 'maintained by'] },
  { key: 'registrar', label: 'Registrar', aliases: ['registrar', 'domain registrar'] },
  { key: 'dnsManagedBy', label: 'DNS managed by', aliases: ['dns', 'dns managed by', 'dns provider'] },
  { key: 'autoRenewal', label: 'Auto-renewal', aliases: ['auto renewal', 'auto-renewal', 'autorenew', 'renewal'] },
  { key: 'primaryContact', label: 'Primary contact', aliases: ['contact', 'primary contact', 'owner', 'domain owner'] },
  { key: 'webspace', label: 'Webspace (GB)', aliases: ['webspace', 'webspace gb', 'hosting gb', 'disk space'] },
  { key: 'webspaceStartDate', label: 'Webspace start date', aliases: ['webspace start date', 'webspace since', 'hosting start date', 'hosting date'] },
  { key: 'sslEnabled', label: 'SSL enabled', aliases: ['ssl', 'ssl enabled', 'https enabled', 'certificate enabled'] },
  { key: 'sslEnabledDate', label: 'SSL enabled date', aliases: ['ssl enabled date', 'ssl date', 'https date', 'certificate date'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments', 'remarks'] }
];

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function detectDelimiter(text) {
  const firstLine = String(text || '').split(/\r?\n/, 1)[0];
  return [';', '\t', ','].sort((left, right) => firstLine.split(right).length - firstLine.split(left).length)[0] || ',';
}

function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const records = [];
  let record = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      record.push(value);
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      record.push(value);
      if (record.some((cell) => cell.trim())) records.push(record);
      record = [];
      value = '';
    } else {
      value += character;
    }
  }
  record.push(value);
  if (record.some((cell) => cell.trim())) records.push(record);
  if (records.length < 2) throw new Error('CSV must contain a header row and at least one domain row');
  const rawHeaders = records[0].map((header, index) => String(header || '').replace(/^\uFEFF/, '').trim() || `Column ${index + 1}`);
  const headerCounts = {};
  const headers = rawHeaders.map((header) => {
    headerCounts[header] = (headerCounts[header] || 0) + 1;
    return headerCounts[header] > 1 ? `${header} (${headerCounts[header]})` : header;
  });
  const rows = records.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, String(cells[index] || '').trim()])));
  return { headers, rows };
}

function autoMapping(headers) {
  const normalizedHeaders = headers.map((header) => ({ header, normalized: normalizeHeader(header) }));
  return Object.fromEntries(importFields.map((field) => {
    const match = normalizedHeaders.find(({ normalized }) => field.aliases.includes(normalized));
    return [field.key, match?.header || ''];
  }));
}

function normalizeDomain(value) {
  return String(value || '').trim().replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].split('#')[0].replace(/\.$/, '').toLowerCase();
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  const compactMatch = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  const numericMatch = raw.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
  let year;
  let month;
  let day;
  if (compactMatch) {
    [, year, month, day] = compactMatch;
  } else if (isoMatch) {
    [, year, month, day] = isoMatch;
  } else if (numericMatch) {
    const first = Number(numericMatch[1]);
    const second = Number(numericMatch[2]);
    const third = Number(numericMatch[3]);
    if (numericMatch[1].length === 4) [year, month, day] = [first, second, third];
    else if (numericMatch[3].length === 4 && first > 12) [year, month, day] = [third, second, first];
    else if (numericMatch[3].length === 4 && second > 12) [year, month, day] = [third, first, second];
    else if (numericMatch[3].length === 4) [year, month, day] = [third, second, first];
  } else if (/^\d{1,6}$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 100000) {
    const date = new Date(1899, 11, 30);
    date.setDate(date.getDate() + Number(raw));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  } else {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.valueOf())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (!year || !month || !day || Number.isNaN(parsed.valueOf()) || parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day)) return '';
  return parsed.toISOString().slice(0, 10);
}

function parseBoolean(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return false;
  if (['yes', 'true', '1', 'on', 'enabled', 'enable', 'y'].includes(raw)) return true;
  if (['no', 'false', '0', 'off', 'disabled', 'disable', 'n'].includes(raw)) return false;
  return null;
}

function parseNumber(value) {
  const raw = String(value || '').replace(/,/g, '').replace(/\s*gb\s*$/i, '').trim();
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function getRawValue(row, mapping, key) {
  return mapping[key] ? row[mapping[key]] || '' : '';
}

function buildPreview(row, rowNumber, mapping, seenDomains) {
  const rawDomain = getRawValue(row, mapping, 'domain');
  const domain = normalizeDomain(rawDomain);
  const rawWebspace = getRawValue(row, mapping, 'webspace');
  const rawWebspaceStartDate = getRawValue(row, mapping, 'webspaceStartDate');
  const rawSslEnabled = getRawValue(row, mapping, 'sslEnabled');
  const rawSslEnabledDate = getRawValue(row, mapping, 'sslEnabledDate');
  const webspaceStartDate = normalizeDate(rawWebspaceStartDate);
  const sslEnabledDate = normalizeDate(rawSslEnabledDate);
  const webspace = parseNumber(rawWebspace);
  const sslEnabledValue = parseBoolean(rawSslEnabled);
  const errors = [];
  if (!mapping.domain) errors.push('Map a domain column');
  else if (!domain || !domain.includes('.')) errors.push('Invalid domain');
  else if (seenDomains.has(domain)) errors.push('Duplicate domain');
  else seenDomains.add(domain);
  if (rawWebspace && webspace === null) errors.push('Invalid webspace');
  if (rawWebspaceStartDate && !webspaceStartDate) errors.push('Invalid webspace date');
  if (rawSslEnabled && sslEnabledValue === null) errors.push('Invalid SSL value');
  if (rawSslEnabledDate && !sslEnabledDate) errors.push('Invalid SSL date');
  const sslEnabled = sslEnabledValue === null || sslEnabledValue === false ? Boolean(sslEnabledDate) : sslEnabledValue;
  const values = {
    clientCompany: getRawValue(row, mapping, 'clientCompany'),
    maintenanceResponsibility: getRawValue(row, mapping, 'maintenanceResponsibility'),
    registrar: getRawValue(row, mapping, 'registrar'),
    dnsManagedBy: getRawValue(row, mapping, 'dnsManagedBy'),
    autoRenewal: parseBoolean(getRawValue(row, mapping, 'autoRenewal')) === true,
    primaryContact: getRawValue(row, mapping, 'primaryContact'),
    webspace,
    webspaceStartDate,
    sslEnabled,
    sslEnabledDate,
    notes: getRawValue(row, mapping, 'notes')
  };
  return { rowNumber, domain, values, errors };
}

export default function DomainImportDialog({ open, onClose, onImported }) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [importing, setImporting] = useState(false);

  const previews = useMemo(() => {
    const seenDomains = new Set();
    return rows.map((row, index) => buildPreview(row, index + 2, mapping, seenDomains));
  }, [mapping, rows]);
  const validRows = previews.filter((row) => !row.errors.length);

  const reset = () => {
    setFileName('');
    setHeaders([]);
    setRows([]);
    setMapping({});
    setError('');
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const close = () => {
    if (importing) return;
    reset();
    onClose();
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseCsv(await file.text());
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(autoMapping(parsed.headers));
      setError('');
      setResult(null);
    } catch (fileError) {
      setError(fileError.message);
      setHeaders([]);
      setRows([]);
    }
  };

  const downloadTemplate = () => {
    const headers = importFields.map((field) => field.label);
    const blob = new Blob([`${headers.map((header) => `"${header.replace(/"/g, '""')}"`).join(',')}\r\n`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'domain-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!validRows.length) return;
    try {
      setImporting(true);
      setError('');
      const payload = await importDomains(validRows.map((row) => ({ domain: row.domain, management: row.values })));
      setResult(payload);
      await onImported();
    } catch (importError) {
      setError(importError.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="lg">
      <DialogTitle>Import domains</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 1 }}>
            <Box>
              <Typography variant="body2">Upload a CSV with one domain per row, then confirm the column mapping.</Typography>
              <Typography variant="caption" color="text.secondary">Dates accept ISO, DD/MM/YYYY, MM/DD/YYYY, dashed or dotted dates, month names, timestamps, and Excel date numbers. Ambiguous numeric dates use day-first order.</Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="text" onClick={downloadTemplate}>Download template</Button>
              <Button variant="outlined" startIcon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>Choose CSV</Button>
            </Stack>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" hidden onChange={handleFile} />
          </Stack>
          {fileName && <Chip label={`${fileName} · ${rows.length} data row${rows.length === 1 ? '' : 's'}`} onDelete={reset} />}
          {error && <Alert severity="error">{error}</Alert>}
          {result && <Alert severity={result.failed ? 'warning' : 'success'}>Imported {result.imported} domain{result.imported === 1 ? '' : 's'}{result.failed ? `; ${result.failed} row${result.failed === 1 ? '' : 's'} failed` : ''}.</Alert>}
          {!!headers.length && <>
            <Typography variant="subtitle2">Column mapping</Typography>
            <Grid container spacing={1.5}>
              {importFields.map((field) => (
                <Grid key={field.key} size={{ xs: 12, sm: 6, md: 4 }}>
                  <FormControl size="small" fullWidth required={field.required}>
                    <InputLabel>{field.label}{field.required ? ' *' : ''}</InputLabel>
                    <Select label={`${field.label}${field.required ? ' *' : ''}`} value={mapping[field.key] || ''} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))}>
                      <MenuItem value="">Ignore column</MenuItem>
                      {headers.map((header) => <MenuItem key={header} value={header}>{header}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              ))}
            </Grid>
            <Alert severity="info">{validRows.length} valid row{validRows.length === 1 ? '' : 's'} ready to import. Invalid rows remain visible below and will be skipped.</Alert>
            <TableContainer sx={{ maxHeight: 330, border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow><TableCell>CSV row</TableCell><TableCell>Domain</TableCell><TableCell>Webspace</TableCell><TableCell>Webspace date</TableCell><TableCell>SSL date</TableCell><TableCell>Validation</TableCell></TableRow></TableHead>
                <TableBody>
                  {previews.map((row) => <TableRow key={row.rowNumber}><TableCell>{row.rowNumber}</TableCell><TableCell>{row.domain || '—'}</TableCell><TableCell>{row.values.webspace === null ? '—' : `${row.values.webspace} GB`}</TableCell><TableCell>{row.values.webspaceStartDate || '—'}</TableCell><TableCell>{row.values.sslEnabledDate || '—'}</TableCell><TableCell>{row.errors.length ? <Chip size="small" color="error" label={row.errors.join(', ')} /> : <Chip size="small" color="success" label="Ready" />}</TableCell></TableRow>)}
                </TableBody>
              </Table>
            </TableContainer>
          </>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={importing}>{result ? 'Close' : 'Cancel'}</Button>
        {!result && <Button variant="contained" onClick={handleImport} disabled={importing || !validRows.length}>{importing ? <CircularProgress size={22} color="inherit" /> : `Import ${validRows.length || ''} domain${validRows.length === 1 ? '' : 's'}`}</Button>}
      </DialogActions>
    </Dialog>
  );
}

DomainImportDialog.propTypes = { open: PropTypes.bool, onClose: PropTypes.func, onImported: PropTypes.func };
