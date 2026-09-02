import PropTypes from 'prop-types';
import MainCard from 'components/MainCard';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export default function Pm2StatCard({ title, value, helper }) {
  return (
    <MainCard contentSX={{ p: 2.25 }}>
      <Stack sx={{ gap: 0.5 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>{title}</Typography>
        <Typography variant="h4">{value}</Typography>
      </Stack>
      {helper && <Typography variant="caption" sx={{ display: 'block', pt: 2.25, color: 'text.secondary' }}>{helper}</Typography>}
    </MainCard>
  );
}

Pm2StatCard.propTypes = { title: PropTypes.string, value: PropTypes.string, helper: PropTypes.string };
