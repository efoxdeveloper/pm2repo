import PropTypes from 'prop-types';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { activity as initialActivity } from 'data/pm2';
import { getApplicationLogs, getApplications, getServerInfo, performApplicationAction } from 'api/pm2';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

const Pm2Context = createContext(null);

export function Pm2Provider({ children }) {
  const [applications, setApplications] = useState([]);
  const [server, setServer] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activity, setActivity] = useState(initialActivity);
  const [notification, setNotification] = useState(null);

  const notify = useCallback((message, severity = 'success') => {
    setNotification({ message, severity });
  }, []);

  const refreshApplications = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await getApplications();
      setApplications(payload.applications || []);
      setError(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshServer = useCallback(async () => {
    try {
      const payload = await getServerInfo();
      setServer(payload.server);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  const refreshLogs = useCallback(async (items = applications) => {
    if (!items.length) return;
    const results = await Promise.all(items.map((application) => getApplicationLogs(application.id).catch(() => ({ logs: [] }))));
    setLogs(results.flatMap((result) => result.logs || []));
  }, [applications]);

  useEffect(() => {
    refreshApplications();
    refreshServer();
  }, [refreshApplications, refreshServer]);

  useEffect(() => {
    refreshLogs();
  }, [refreshLogs]);

  const record = useCallback((application, action, result = 'success', details) => {
    setActivity((current) => [
      {
        id: Date.now(),
        time: '02 Sep 2026 10:40',
        application: application.displayName,
        action,
        user: 'Admin',
        result,
        details: details || `Application ${action === 'Stop' ? 'stopped' : `${action.toLowerCase()}ed`} successfully`
      },
      ...current
    ]);
  }, []);

  const performAction = useCallback(
    async (id, action) => {
      const application = applications.find((item) => item.id === id);
      if (!application) return;
      try {
        await performApplicationAction(id, action);
        await refreshApplications();
        record(application, action === 'restart' ? 'Restart' : action === 'reload' ? 'Reload' : action === 'start' ? 'Start' : 'Stop');
        notify(`${application.displayName} ${action === 'stop' ? 'stopped' : `${action}ed`} successfully.`);
      } catch (requestError) {
        notify(requestError.message, 'error');
      }
    },
    [applications, notify, record, refreshApplications]
  );

  const deleteApplication = useCallback(
    async (id) => {
      const application = applications.find((item) => item.id === id);
      if (!application) return;
      try {
        await performApplicationAction(id, 'delete');
        await refreshApplications();
        record(application, 'Delete', 'success', 'Application removed from the process list');
        notify(`${application.displayName} removed from PM2.`);
      } catch (requestError) {
        notify(requestError.message, 'error');
      }
    },
    [applications, notify, record, refreshApplications]
  );

  const value = useMemo(
    () => ({ applications, activity, server, logs, loading, error, notification, setNotification, notify, performAction, deleteApplication, refreshApplications, refreshServer, refreshLogs }),
    [activity, applications, deleteApplication, error, loading, logs, notification, notify, performAction, refreshApplications, refreshLogs, refreshServer, server]
  );

  return (
    <Pm2Context.Provider value={value}>
      {children}
      <Snackbar open={Boolean(notification)} autoHideDuration={3500} onClose={() => setNotification(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={notification?.severity || 'success'} onClose={() => setNotification(null)}>{notification?.message}</Alert>
      </Snackbar>
    </Pm2Context.Provider>
  );
}

export function usePm2() {
  const context = useContext(Pm2Context);
  if (!context) throw new Error('usePm2 must be used within Pm2Provider');
  return context;
}

Pm2Provider.propTypes = { children: PropTypes.node };
