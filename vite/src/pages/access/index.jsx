import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Grid from '@mui/material/Grid';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import MainCard from 'components/MainCard';
import { createRole, createUser, deleteRole, getApplicationAssignments, getAvailableApplications, getPermissions, getRoles, getUsers, resetUserPassword, updateRole, updateUserAccess, updateUserApplications } from 'api/auth';
import { useAuth } from 'contexts/AuthContext';

const initialUser = { username: '', displayName: '', password: '', roleId: '' };
const initialRole = { name: '', description: '', permissions: [] };

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Never' : date.toLocaleString();
}

export default function AccessPage() {
  const { hasPermission, user: currentUser } = useAuth();
  const canManageUsers = hasPermission('users.manage');
  const canManageRoles = hasPermission('roles.manage');
  const [tab, setTab] = useState(0);
  const roleTab = canManageUsers ? 1 : 0;
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [availableApplications, setAvailableApplications] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedApplicationUser, setSelectedApplicationUser] = useState('');
  const [assignedApplications, setAssignedApplications] = useState([]);
  const [userForm, setUserForm] = useState(initialUser);
  const [roleForm, setRoleForm] = useState(initialRole);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [resetUserTarget, setResetUserTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [applicationLoadError, setApplicationLoadError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const [userPayload, rolePayload, permissionPayload, applicationPayload, assignmentPayload] = await Promise.all([canManageUsers ? getUsers() : Promise.resolve({ users: [] }), (canManageUsers || canManageRoles) ? getRoles() : Promise.resolve({ roles: [] }), canManageRoles ? getPermissions().catch(() => ({ permissions: [] })) : Promise.resolve({ permissions: [] }), canManageUsers ? getAvailableApplications().then((payload) => { setApplicationLoadError(''); return payload; }).catch((requestError) => { setApplicationLoadError(requestError.message); return { applications: [] }; }) : Promise.resolve({ applications: [] }), canManageUsers ? getApplicationAssignments().catch(() => ({ assignments: [] })) : Promise.resolve({ assignments: [] })]);
      setUsers(userPayload.users || []);
      setRoles(rolePayload.roles || []);
      setPermissions(permissionPayload.permissions || []);
      setAvailableApplications(applicationPayload.applications || []);
      setAssignments(assignmentPayload.assignments || []);
      setError(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [canManageRoles, canManageUsers]);

  useEffect(() => {
    if (!selectedApplicationUser && users[0]) setSelectedApplicationUser(String(users[0].id));
    const names = assignments.filter((item) => Number(item.userId) === Number(selectedApplicationUser)).map((item) => item.applicationName);
    setAssignedApplications(names);
  }, [assignments, selectedApplicationUser, users]);

  const saveUser = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      const payload = await createUser(userForm);
      setUsers((current) => [...current, { ...payload.user, displayName: payload.user.displayName || payload.user.display_name, role: roles.find((role) => role.id === Number(userForm.roleId))?.name || '—', roleId: Number(userForm.roleId), isActive: true }].sort((left, right) => left.username.localeCompare(right.username)));
      setUserForm(initialUser);
      setError(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const saveRole = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      if (editingRoleId) {
        const payload = await updateRole(editingRoleId, roleForm);
        setRoles((current) => current.map((role) => Number(role.id) === Number(editingRoleId) ? payload.role : role));
      } else {
        const payload = await createRole(roleForm);
        setRoles((current) => [...current, { ...payload.role, permissions: roleForm.permissions, user_count: 0 }].sort((left, right) => left.name.localeCompare(right.name)));
      }
      setRoleForm(initialRole);
      setEditingRoleId(null);
      setError(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const editRole = (role) => {
    setEditingRoleId(Number(role.id));
    setRoleForm({ name: role.name, description: role.description || '', permissions: role.permissions || [] });
  };

  const removeRole = async (role) => {
    if (!window.confirm(`Delete the ${role.name} role?`)) return;
    try {
      const payload = await deleteRole(role.id);
      setRoles(payload.roles || []);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const saveResetPassword = async () => {
    if (!resetUserTarget) return;
    try {
      setSaving(true);
      await resetUserPassword(resetUserTarget.id, resetPassword);
      setResetUserTarget(null);
      setResetPassword('');
      setError(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const changeUserRole = async (id, roleId) => {
    try {
      const payload = await updateUserAccess(id, { roleId });
      setUsers(payload.users || []);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const toggleUser = async (user) => {
    try {
      const payload = await updateUserAccess(user.id, { isActive: !user.isActive });
      setUsers(payload.users || []);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const saveApplicationAccess = async () => {
    if (!selectedApplicationUser) return;
    try {
      setSaving(true);
      const payload = await updateUserApplications(Number(selectedApplicationUser), assignedApplications);
      setAssignments((current) => [...current.filter((item) => Number(item.userId) !== Number(selectedApplicationUser)), ...payload.applications.map((applicationName) => ({ userId: Number(selectedApplicationUser), applicationName }))]);
      setError(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  if (!canManageUsers && !canManageRoles) return <Alert severity="error">You do not have permission to manage users or roles.</Alert>;

  return <Grid container rowSpacing={3} columnSpacing={2.75}>
    <Grid size={12}><Typography variant="h5">Users & roles</Typography></Grid>
    {error && <Grid size={12}><Alert severity="error" onClose={() => setError(null)}>{error}</Alert></Grid>}
    <Grid size={12}><MainCard content={false}><Tabs value={tab} onChange={(_, value) => setTab(value)}>{canManageUsers && <Tab value={0} label="Users" />}{canManageRoles && <Tab value={roleTab} label="Roles & permissions" />}</Tabs></MainCard></Grid>
    {tab === 0 && canManageUsers && <>
      <Grid size={{ xs: 12, md: 4 }}><MainCard title="Create user"><Stack component="form" onSubmit={saveUser} spacing={2}><TextField required label="Username" value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} /><TextField required label="Display name" value={userForm.displayName} onChange={(event) => setUserForm({ ...userForm, displayName: event.target.value })} /><TextField required type="password" label="Temporary password" helperText="Minimum 12 characters" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} /><FormControl required><InputLabel>Role</InputLabel><Select label="Role" value={userForm.roleId} onChange={(event) => setUserForm({ ...userForm, roleId: event.target.value })}>{roles.map((role) => <MenuItem key={role.id} value={role.id}>{role.name}</MenuItem>)}</Select></FormControl><Button type="submit" variant="contained" disabled={saving || !userForm.roleId}>{saving ? <CircularProgress size={22} color="inherit" /> : 'Create user'}</Button></Stack></MainCard></Grid>
      <Grid size={{ xs: 12, md: 8 }}><MainCard title="Managed users" content={false}><TableContainer sx={{ overflowX: 'auto' }}><Table><TableHead><TableRow><TableCell>User</TableCell><TableCell>Role</TableCell><TableCell>Status</TableCell><TableCell>Last login</TableCell><TableCell>Actions</TableCell></TableRow></TableHead><TableBody>{loading && <TableRow><TableCell colSpan={5}><Stack sx={{ alignItems: 'center', py: 4 }}><CircularProgress size={25} /></Stack></TableCell></TableRow>}{!loading && users.map((user) => <TableRow key={user.id}><TableCell><Typography variant="subtitle2">{user.displayName}</Typography><Typography variant="caption" color="text.secondary">{user.username}</Typography></TableCell><TableCell><Select size="small" value={user.roleId} onChange={(event) => changeUserRole(user.id, event.target.value)}>{roles.map((role) => <MenuItem key={role.id} value={role.id}>{role.name}</MenuItem>)}</Select></TableCell><TableCell><Chip size="small" variant="combined" color={user.isActive ? 'success' : 'error'} label={user.isActive ? 'Active' : 'Disabled'} /></TableCell><TableCell>{formatDate(user.lastLoginAt)}</TableCell><TableCell><Stack direction="row" spacing={1}><Button size="small" onClick={() => toggleUser(user)}>{user.isActive ? 'Disable' : 'Enable'}</Button><Button size="small" disabled={Number(user.id) === Number(currentUser?.id)} onClick={() => setResetUserTarget(user)}>Reset password</Button></Stack></TableCell></TableRow>)}</TableBody></Table></TableContainer></MainCard></Grid>
      <Grid size={12}><MainCard title="Application access"><Stack spacing={2}>{applicationLoadError && <Alert severity="warning">Applications could not be loaded. Ensure the backend uses the same PM2_HOME as the running applications, then refresh.</Alert>}<FormControl><InputLabel>User</InputLabel><Select label="User" value={selectedApplicationUser} onChange={(event) => setSelectedApplicationUser(event.target.value)}>{users.map((user) => <MenuItem key={user.id} value={user.id}>{user.displayName} ({user.username})</MenuItem>)}</Select></FormControl>{!applicationLoadError && !availableApplications.length && <Alert severity="info">No applications are registered yet. Start an application through PM2 and refresh this page to register it.</Alert>}<FormGroup row>{availableApplications.map((application) => <FormControlLabel key={application.name} control={<Checkbox checked={assignedApplications.includes(application.name)} onChange={(event) => setAssignedApplications((current) => event.target.checked ? [...current, application.name] : current.filter((name) => name !== application.name))} />} label={`${application.displayName}${application.isActive === false ? ' (not currently active)' : ''}`} />)}</FormGroup><Button variant="contained" onClick={saveApplicationAccess} disabled={saving || !selectedApplicationUser || Boolean(applicationLoadError)}>{saving ? <CircularProgress size={22} color="inherit" /> : 'Save Application Access'}</Button></Stack></MainCard></Grid>
    </>}
    {tab === roleTab && canManageRoles && <>
      <Grid size={{ xs: 12, md: 4 }}><MainCard title={editingRoleId ? 'Edit custom role' : 'Create custom role'}><Stack component="form" onSubmit={saveRole} spacing={2}><TextField required label="Role name" value={roleForm.name} onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })} disabled={Boolean(editingRoleId && roles.find((role) => Number(role.id) === Number(editingRoleId))?.is_system)} /><TextField label="Description" multiline minRows={2} value={roleForm.description} onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })} /><Typography variant="subtitle2">Permissions</Typography><FormGroup>{permissions.map((permission) => <FormControlLabel key={permission.key} control={<Checkbox checked={roleForm.permissions.includes(permission.key)} onChange={(event) => setRoleForm({ ...roleForm, permissions: event.target.checked ? [...roleForm.permissions, permission.key] : roleForm.permissions.filter((key) => key !== permission.key) })} />} label={permission.key} />)}</FormGroup><Stack direction="row" spacing={1}><Button type="submit" variant="contained" disabled={saving}>{saving ? <CircularProgress size={22} color="inherit" /> : editingRoleId ? 'Save role' : 'Create role'}</Button>{editingRoleId && <Button onClick={() => { setEditingRoleId(null); setRoleForm(initialRole); }}>Cancel</Button>}</Stack></Stack></MainCard></Grid>
      <Grid size={{ xs: 12, md: 8 }}><MainCard title="Available roles" content={false}><TableContainer><Table><TableHead><TableRow><TableCell>Role</TableCell><TableCell>Permissions</TableCell><TableCell>Users</TableCell><TableCell>Actions</TableCell></TableRow></TableHead><TableBody>{roles.map((role) => <TableRow key={role.id}><TableCell><Typography variant="subtitle2">{role.name}</Typography><Typography variant="caption" color="text.secondary">{role.description}</Typography></TableCell><TableCell>{role.is_system ? <Chip size="small" color="primary" label="All permissions" /> : (role.permissions || []).map((permission) => <Chip key={permission} size="small" sx={{ mr: 0.5, mb: 0.5 }} label={permission} />)}</TableCell><TableCell>{role.user_count || 0}</TableCell><TableCell>{!role.is_system && <Stack direction="row" spacing={1}><Button size="small" onClick={() => editRole(role)}>Edit</Button><Button size="small" color="error" onClick={() => removeRole(role)}>Delete</Button></Stack>}</TableCell></TableRow>)}</TableBody></Table></TableContainer></MainCard></Grid>
    </>}
    <Dialog open={Boolean(resetUserTarget)} onClose={() => !saving && setResetUserTarget(null)} fullWidth maxWidth="xs"><DialogTitle>Reset password</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><Typography variant="body2">Set a new password for {resetUserTarget?.displayName || resetUserTarget?.username}.</Typography><TextField autoFocus type="password" label="New password" helperText="Minimum 12 characters" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} fullWidth /></Stack></DialogContent><DialogActions><Button onClick={() => setResetUserTarget(null)} disabled={saving}>Cancel</Button><Button variant="contained" onClick={saveResetPassword} disabled={saving || resetPassword.length < 12}>{saving ? <CircularProgress size={22} color="inherit" /> : 'Reset password'}</Button></DialogActions></Dialog>
  </Grid>;
}
