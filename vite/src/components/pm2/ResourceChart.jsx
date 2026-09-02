import PropTypes from 'prop-types';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import { axisClasses, chartsGridClasses, LineChart, lineClasses } from '@mui/x-charts';

export default function ResourceChart({ labels, data, label, unit = '%', height = 270, color = 'primary.main' }) {
  const theme = useTheme();
  const resolvedColor = color.includes('.') ? color.split('.').reduce((value, key) => value?.[key], theme.vars.palette) : color;
  return (
    <Box sx={{ width: '100%' }}>
      <LineChart
      hideLegend
      grid={{ horizontal: true }}
      xAxis={[{ data: labels, scaleType: 'point', disableLine: true, tickSize: 7 }]}
      yAxis={[{ disableLine: true, tickSize: 7, valueFormatter: (value) => `${value}${unit}` }]}
      series={[{ data, label, showMark: false, area: true, color: resolvedColor }]}
      height={height}
      margin={{ top: 20, right: 20, bottom: 25, left: 10 }}
      sx={{
        [`& .${lineClasses.line}`]: { strokeWidth: 2 },
        [`& .${chartsGridClasses.line}`]: { strokeDasharray: '4 4', stroke: theme.vars.palette.divider },
        [`& .${axisClasses.root}.${axisClasses.directionX} .${axisClasses.tick}`]: { stroke: 'transparent' },
        [`& .${axisClasses.root}.${axisClasses.directionY} .${axisClasses.tick}`]: { stroke: 'transparent' }
      }}
      />
    </Box>
  );
}

ResourceChart.propTypes = { labels: PropTypes.array, data: PropTypes.array, label: PropTypes.string, unit: PropTypes.string, height: PropTypes.number, color: PropTypes.string };
