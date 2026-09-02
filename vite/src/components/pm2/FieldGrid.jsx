import PropTypes from 'prop-types';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export default function FieldGrid({ fields }) {
  return <Grid container spacing={2}>{fields.map((field) => <Grid size={{ xs: 12, sm: 6 }} key={field.label}><Stack sx={{ gap: 0.5 }}><Typography variant="caption" color="text.secondary">{field.label}</Typography><Typography variant="body1" sx={{ wordBreak: 'break-word' }}>{field.value}</Typography></Stack></Grid>)}</Grid>;
}

FieldGrid.propTypes = { fields: PropTypes.array };
