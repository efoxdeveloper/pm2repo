import PropTypes from 'prop-types';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// material-ui
import { useTheme } from '@mui/material/styles';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CardContent from '@mui/material/CardContent';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';

// project imports
import ProfileTab from './ProfileTab';
import SettingTab from './SettingTab';
import Avatar from 'components/@extended/Avatar';
import MainCard from 'components/MainCard';
import Transitions from 'components/@extended/Transitions';
import IconButton from 'components/@extended/IconButton';
import { useAuth } from 'contexts/AuthContext';
import { changePassword } from 'api/auth';

// assets
import LogoutOutlined from '@ant-design/icons/LogoutOutlined';
import SettingOutlined from '@ant-design/icons/SettingOutlined';
import UserOutlined from '@ant-design/icons/UserOutlined';
import avatar1 from 'assets/images/users/avatar-1.png';

// tab panel wrapper
function TabPanel({ children, value, index, ...other }) {
  return (
    <div role="tabpanel" hidden={value !== index} id={`profile-tabpanel-${index}`} aria-labelledby={`profile-tab-${index}`} {...other}>
      {value === index && children}
    </div>
  );
}

function a11yProps(index) {
  return {
    id: `profile-tab-${index}`,
    'aria-controls': `profile-tabpanel-${index}`
  };
}

// ==============================|| HEADER CONTENT - PROFILE ||============================== //

export default function Profile() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };

  const handleClose = (event) => {
    if (anchorRef.current && anchorRef.current.contains(event.target)) {
      return;
    }
    setOpen(false);
  };

  const [value, setValue] = useState(0);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmation: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const savePassword = async () => {
    if (passwords.newPassword.length < 12) { setPasswordError('New password must be at least 12 characters.'); return; }
    if (passwords.newPassword !== passwords.confirmation) { setPasswordError('New passwords do not match.'); return; }
    try {
      setPasswordSaving(true);
      setPasswordError('');
      await changePassword({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
      setPasswordOpen(false);
      setPasswords({ currentPassword: '', newPassword: '', confirmation: '' });
      await handleLogout();
    } catch (error) {
      setPasswordError(error.message);
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <Box sx={{ flexShrink: 0, ml: 'auto' }}>
      <Tooltip title="Profile" disableInteractive>
        <ButtonBase
          sx={(theme) => ({
            p: 0.25,
            borderRadius: 1,
            '&:focus-visible': { outline: `2px solid ${theme.vars.palette.secondary.dark}`, outlineOffset: 2 }
          })}
          aria-label="open profile"
          ref={anchorRef}
          aria-controls={open ? 'profile-grow' : undefined}
          aria-haspopup="true"
          onClick={handleToggle}
        >
          <Avatar alt="profile user" src={avatar1} size="sm" sx={{ '&:hover': { outline: '1px solid', outlineColor: 'primary.main' } }} />
        </ButtonBase>
      </Tooltip>
      <Popper
        placement="bottom-end"
        open={open}
        anchorEl={anchorRef.current}
        role={undefined}
        transition
        disablePortal
        popperOptions={{
          modifiers: [
            {
              name: 'offset',
              options: {
                offset: [0, 9]
              }
            }
          ]
        }}
      >
        {({ TransitionProps }) => (
          <Transitions type="grow" position="top-right" in={open} {...TransitionProps}>
            <Paper sx={(theme) => ({ boxShadow: theme.vars.customShadows.z1, width: 290, minWidth: 240, maxWidth: { xs: 250, md: 290 } })}>
              <ClickAwayListener onClickAway={handleClose}>
                <MainCard elevation={0} border={false} content={false}>
                  <CardContent sx={{ px: 2.5, pt: 3 }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <Stack direction="row" sx={{ gap: 1.25, alignItems: 'center' }}>
                        <Avatar alt="profile user" src={avatar1} sx={{ width: 32, height: 32 }} />
                        <Stack>
                          <Typography variant="h6">{user?.displayName || user?.username}</Typography>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            {user?.role || 'Administrator'}
                          </Typography>
                        </Stack>
                      </Stack>
                      <Tooltip title="Logout">
                        <IconButton size="large" sx={{ color: 'text.primary' }} onClick={handleLogout}>
                          <LogoutOutlined />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </CardContent>

                  <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs variant="fullWidth" value={value} onChange={handleChange} aria-label="profile tabs">
                      <Tab
                        sx={{
                          display: 'flex',
                          flexDirection: 'row',
                          justifyContent: 'center',
                          alignItems: 'center',
                          textTransform: 'capitalize',
                          gap: 1.25,
                          '& .MuiTab-icon': {
                            marginBottom: 0
                          }
                        }}
                        icon={<UserOutlined />}
                        label="Profile"
                        {...a11yProps(0)}
                      />
                      <Tab
                        sx={{
                          display: 'flex',
                          flexDirection: 'row',
                          justifyContent: 'center',
                          alignItems: 'center',
                          textTransform: 'capitalize',
                          gap: 1.25,
                          '& .MuiTab-icon': {
                            marginBottom: 0
                          }
                        }}
                        icon={<SettingOutlined />}
                        label="Setting"
                        {...a11yProps(1)}
                      />
                    </Tabs>
                  </Box>
                  <TabPanel value={value} index={0} dir={theme.direction}>
                    <ProfileTab onChangePassword={() => { setPasswordError(''); setPasswordOpen(true); setOpen(false); }} onLogout={handleLogout} />
                  </TabPanel>
                  <TabPanel value={value} index={1} dir={theme.direction}>
                    <SettingTab />
                  </TabPanel>
                </MainCard>
              </ClickAwayListener>
            </Paper>
          </Transitions>
        )}
      </Popper>
      <Dialog open={passwordOpen} onClose={() => !passwordSaving && setPasswordOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Change password</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>{passwordError && <Alert severity="error">{passwordError}</Alert>}<TextField type="password" label="Current password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} fullWidth /><TextField type="password" label="New password" helperText="Minimum 12 characters" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} fullWidth /><TextField type="password" label="Confirm new password" value={passwords.confirmation} onChange={(event) => setPasswords({ ...passwords, confirmation: event.target.value })} fullWidth /></Stack></DialogContent>
        <DialogActions><Button onClick={() => setPasswordOpen(false)} disabled={passwordSaving}>Cancel</Button><Button variant="contained" onClick={savePassword} disabled={passwordSaving || !passwords.currentPassword || passwords.newPassword.length < 12 || !passwords.confirmation}>Update password</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

TabPanel.propTypes = { children: PropTypes.node, value: PropTypes.number, index: PropTypes.number, other: PropTypes.any };
