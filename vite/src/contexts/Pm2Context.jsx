import PropTypes from 'prop-types';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { buildApplication, createApplication as createPm2Application, deployApplication, getApplicationLogs, getApplications, getServerInfo, installApplicationDependencies, performApplicationAction, pullApplication } from 'api/pm2';
import { getActivity } from 'api/activity';
import { getSettings } from 'api/settings';
import { useAuth } from 'contexts/AuthContext';
import { toast, ToastContainer } from 'react-toastify';

const Pm2Context = createContext(null);

export function Pm2Provider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [applications, setApplications] = useState([]);
  const [server, setServer] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activity, setActivity] = useState([]);
  const [serverHistory, setServerHistory] = useState([]);
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [pendingActions, setPendingActions] = useState({});
  const [deploymentResults, setDeploymentResults] = useState({});
  const [commandResults, setCommandResults] = useState({});

  const notify = useCallback((message, severity = 'success') => {
    const toastMethod = toast[severity] || toast;
    toastMethod(message);
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
      setServerHistory((current) => [...current, {
        label: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cpu: Number(payload.server.cpuUsage) || 0,
        memory: Number(payload.server.memory?.usage) || 0
      }].slice(-12));
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  const refreshActivity = useCallback(async () => {
    try {
      const payload = await getActivity();
      setActivity(payload.activity || []);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return undefined;
    getSettings().then((payload) => {
      setRefreshInterval(Math.max(5, Number(payload.settings?.refreshInterval) || 10));
      setAutoRefresh(payload.settings?.autoRefreshProcesses !== false);
    }).catch(() => {});
    const handleSettingsUpdate = (event) => {
      const settings = event.detail || {};
      setRefreshInterval(Math.max(5, Number(settings.refreshInterval) || 10));
      setAutoRefresh(settings.autoRefreshProcesses !== false);
    };
    window.addEventListener('pm2-settings-updated', handleSettingsUpdate);
    return () => window.removeEventListener('pm2-settings-updated', handleSettingsUpdate);
  }, [authLoading, user]);

  const createApplication = useCallback(
    async (configuration) => {
      const payload = await createPm2Application(configuration);
      await refreshApplications();
      notify(`${payload.application.displayName} started successfully.`);
      if (payload.application.startupDiagnosis?.hasIssue) notify(`AI detected: ${payload.application.startupDiagnosis.issue} Solution: ${payload.application.startupDiagnosis.solution}`, payload.application.startupDiagnosis.severity || 'warning');
      return payload.application;
    },
    [notify, refreshApplications]
  );

  const refreshLogs = useCallback(async (items = applications) => {
    if (!items.length) return;
    const results = await Promise.all(items.map((application) => getApplicationLogs(application.id).catch(() => ({ logs: [] }))));
    setLogs(results.flatMap((result) => result.logs || []));
  }, [applications]);

  useEffect(() => {
    if (authLoading || !user) return;
    refreshApplications();
    refreshServer();
    refreshActivity();
  }, [authLoading, refreshActivity, refreshApplications, refreshServer, user]);

  useEffect(() => {
    if (authLoading || !user || !autoRefresh) return undefined;
    const interval = window.setInterval(() => {
      refreshApplications();
      refreshServer();
      refreshActivity();
    }, refreshInterval * 1000);
    return () => window.clearInterval(interval);
  }, [authLoading, autoRefresh, refreshActivity, refreshApplications, refreshInterval, refreshServer, user]);

  useEffect(() => {
    if (!authLoading && !user) {
      setApplications([]);
      setServer(null);
      setLogs([]);
      setActivity([]);
      setError(null);
      setLoading(false);
    }
  }, [authLoading, user]);

  useEffect(() => {
    refreshLogs();
  }, [refreshLogs]);

  const performAction = useCallback(
    async (id, action) => {
      const application = applications.find((item) => item.id === id);
      if (!application) return;
      try {
        setPendingActions((current) => ({ ...current, [id]: action }));
        await performApplicationAction(id, action);
        await refreshApplications();
        await refreshActivity();
        notify(`${application.displayName} ${action === 'stop' ? 'stopped' : `${action}ed`} successfully.`);
      } catch (requestError) {
        notify(requestError.message, 'error');
      } finally {
        setPendingActions((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
    },
    [applications, notify, refreshActivity, refreshApplications]
  );

  const deleteApplication = useCallback(
    async (id) => {
      const application = applications.find((item) => item.id === id);
      if (!application) return;
      try {
        setPendingActions((current) => ({ ...current, [id]: 'delete' }));
        await performApplicationAction(id, 'delete');
        await refreshApplications();
        await refreshActivity();
        notify(`${application.displayName} removed from PM2.`);
      } catch (requestError) {
        notify(requestError.message, 'error');
      } finally {
        setPendingActions((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
    },
    [applications, notify, refreshActivity, refreshApplications]
  );

  const deploy = useCallback(
    async (id) => {
      const application = applications.find((item) => item.id === id);
      if (!application) return;
      try {
        setPendingActions((current) => ({ ...current, [id]: 'deploy' }));
        const result = await deployApplication(id);
        setDeploymentResults((current) => ({ ...current, [id]: result }));
        await refreshApplications();
        await refreshActivity();
        notify(`${application.displayName} deployed successfully.`);
        return result;
      } catch (requestError) {
        notify(requestError.message, 'error');
      } finally {
        setPendingActions((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
    },
    [applications, notify, refreshActivity, refreshApplications]
  );

  const runGitPull = useCallback(
    async (id) => {
      const application = applications.find((item) => item.id === id);
      if (!application) return;
      try {
        setPendingActions((current) => ({ ...current, [id]: 'git-pull' }));
        const result = await pullApplication(id);
        setCommandResults((current) => ({ ...current, [id]: { ...(current[id] || {}), gitPull: result } }));
        await refreshActivity();
        notify(`${application.displayName} pulled successfully.`);
        return result;
      } catch (requestError) {
        notify(requestError.message, 'error');
      } finally {
        setPendingActions((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
    },
    [applications, notify, refreshActivity]
  );

  const runBuild = useCallback(
    async (id) => {
      const application = applications.find((item) => item.id === id);
      if (!application) return;
      try {
        setPendingActions((current) => ({ ...current, [id]: 'build' }));
        const result = await buildApplication(id);
        setCommandResults((current) => ({ ...current, [id]: { ...(current[id] || {}), build: result } }));
        await refreshActivity();
        notify(`${application.displayName} built successfully.`);
        return result;
      } catch (requestError) {
        notify(requestError.message, 'error');
      } finally {
        setPendingActions((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
    },
    [applications, notify, refreshActivity]
  );

  const runNpmInstall = useCallback(
    async (id) => {
      const application = applications.find((item) => item.id === id);
      if (!application) return;
      try {
        setPendingActions((current) => ({ ...current, [id]: 'npm-install' }));
        const result = await installApplicationDependencies(id);
        setCommandResults((current) => ({ ...current, [id]: { ...(current[id] || {}), npmInstall: result } }));
        await refreshActivity();
        notify(`${application.displayName} dependencies installed successfully.`);
        return result;
      } catch (requestError) {
        notify(requestError.message, 'error');
      } finally {
        setPendingActions((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
    },
    [applications, notify, refreshActivity]
  );

  const value = useMemo(
    () => ({ applications, activity, server, serverHistory, logs, loading, error, pendingActions, deploymentResults, commandResults, notify, createApplication, performAction, deleteApplication, deploy, runGitPull, runBuild, runNpmInstall, refreshApplications, refreshServer, refreshActivity, refreshLogs }),
    [activity, applications, commandResults, createApplication, deleteApplication, deploy, deploymentResults, error, loading, logs, pendingActions, notify, performAction, refreshActivity, refreshApplications, refreshLogs, refreshServer, runBuild, runGitPull, runNpmInstall, server, serverHistory]
  );

  return (
    <Pm2Context.Provider value={value}>
      {children}
      <ToastContainer position="bottom-right" autoClose={3500} newestOnTop closeOnClick pauseOnFocusLoss />
    </Pm2Context.Provider>
  );
}

export function usePm2() {
  const context = useContext(Pm2Context);
  if (!context) throw new Error('usePm2 must be used within Pm2Provider');
  return context;
}

Pm2Provider.propTypes = { children: PropTypes.node };
