import PropTypes from 'prop-types';
import { Navigate, useLocation } from 'react-router-dom';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import { useAuth } from 'contexts/AuthContext';

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Stack sx={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}><CircularProgress /></Stack>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

RequireAuth.propTypes = { children: PropTypes.node };
