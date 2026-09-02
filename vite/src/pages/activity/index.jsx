import Grid from '@mui/material/Grid';
import MainCard from 'components/MainCard';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { usePm2 } from 'contexts/Pm2Context';

export default function ActivityPage() {
  const { activity } = usePm2();
  return <Grid container rowSpacing={3}><Grid size={12}><MainCard title="Recent Activity" subheader="Actions performed through the PM2 Manager" content={false}><TableContainer sx={{ overflowX: 'auto', '& td, & th': { whiteSpace: 'nowrap' } }}><Table><TableHead><TableRow>{['Time', 'Application', 'Action', 'User', 'Result', 'Details'].map((header) => <TableCell key={header}>{header}</TableCell>)}</TableRow></TableHead><TableBody>{activity.map((item) => <TableRow hover key={item.id}><TableCell>{item.time}</TableCell><TableCell>{item.application}</TableCell><TableCell>{item.action}</TableCell><TableCell>{item.user}</TableCell><TableCell><Chip size="small" variant="combined" color={item.result === 'success' ? 'success' : 'error'} label={item.result === 'success' ? 'Success' : 'Failed'} /></TableCell><TableCell>{item.details}</TableCell></TableRow>)}{!activity.length && <TableRow><TableCell colSpan={6}><Box sx={{ py: 5, textAlign: 'center' }}><Typography color="text.secondary">No activity recorded yet.</Typography></Box></TableCell></TableRow>}</TableBody></Table></TableContainer></MainCard></Grid></Grid>;
}
