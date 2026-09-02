import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

import ApplicationStatusChip from './ApplicationStatusChip';
import ApplicationActionsMenu from './ApplicationActionsMenu';
import { formatMemory, formatUptime } from 'data/pm2';

export default function ApplicationTable({ applications, overview = false }) {
  const headers = overview
    ? ['Application', 'Status', 'PM2 ID', 'PID', 'CPU', 'Memory', 'Uptime', 'Restarts', 'Actions']
    : ['Application', 'Status', 'PM2 ID', 'PID', 'Mode', 'Instances', 'CPU', 'Memory', 'Uptime', 'Restarts', 'Actions'];

  return (
    <TableContainer sx={{ width: '100%', overflowX: 'auto', position: 'relative', display: 'block', maxWidth: '100%', '& td, & th': { whiteSpace: 'nowrap' } }}>
      <Table aria-label="PM2 applications">
        <TableHead><TableRow>{headers.map((header) => <TableCell key={header} align={header === 'Actions' ? 'right' : 'left'}>{header}</TableCell>)}</TableRow></TableHead>
        <TableBody>
          {applications.map((application) => (
            <TableRow hover key={application.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
              <TableCell component="th" scope="row">
                <Link component={RouterLink} to={`/applications/${application.id}`} underline="hover" sx={{ color: 'primary.main', fontWeight: 500 }}>{application.displayName}</Link>
                {!overview && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{application.name}</Typography>}
              </TableCell>
              <TableCell><ApplicationStatusChip status={application.status} /></TableCell>
              <TableCell>{application.id}</TableCell>
              <TableCell>{application.pid || '-'}</TableCell>
              {!overview && <TableCell sx={{ textTransform: 'capitalize' }}>{application.mode}</TableCell>}
              {!overview && <TableCell>{application.instances}</TableCell>}
              <TableCell>{application.cpu}%</TableCell>
              <TableCell>{formatMemory(application.memory)}</TableCell>
              <TableCell>{formatUptime(application.uptime)}</TableCell>
              <TableCell>{application.restarts}</TableCell>
              <TableCell align="right"><ApplicationActionsMenu application={application} /></TableCell>
            </TableRow>
          ))}
          {!applications.length && <TableRow><TableCell colSpan={headers.length}><Box sx={{ py: 5, textAlign: 'center' }}><Typography color="text.secondary">No applications are currently managed by PM2.</Typography></Box></TableCell></TableRow>}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

ApplicationTable.propTypes = { applications: PropTypes.array, overview: PropTypes.bool };
