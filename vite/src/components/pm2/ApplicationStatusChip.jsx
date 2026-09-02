import PropTypes from 'prop-types';
import Chip from '@mui/material/Chip';

const labels = { online: 'Online', stopped: 'Stopped', errored: 'Errored', launching: 'Launching' };
const colors = { online: 'success', stopped: 'warning', errored: 'error', launching: 'info' };

export default function ApplicationStatusChip({ status }) {
  return <Chip size="small" variant="combined" color={colors[status] || 'default'} label={labels[status] || status} />;
}

ApplicationStatusChip.propTypes = { status: PropTypes.string };
