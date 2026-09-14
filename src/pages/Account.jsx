import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Box,
  Grid,
  Button,
  TextField,
  Avatar,
  Chip,
  Tabs,
  Tab,
  Card,
  CardContent,
  CardActions,
  Divider,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
  RadioGroup,
  Radio,
  FormControl,
  FormLabel,
  IconButton,
  CircularProgress,
  Alert,
  Tooltip,
  Skeleton,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SecurityIcon from '@mui/icons-material/Security';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HomeIcon from '@mui/icons-material/Home';
import WorkIcon from '@mui/icons-material/Work';
import PlaceIcon from '@mui/icons-material/Place';
import StarIcon from '@mui/icons-material/Star';
import LogoutIcon from '@mui/icons-material/Logout';
import RefreshIcon from '@mui/icons-material/Refresh';
import LoginIcon from '@mui/icons-material/Login';
import { apiClient } from '../services/apiClient';
import { useNotifier } from '../context/NotificationProvider';
import { clearUserSessionData, notifyAuthChange, getCurrentUserId } from '../utils/userStorage';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div role="tabpanel" hidden={value !== index} id={`account-tabpanel-${index}`} {...other}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

function Account() {
  const navigate = useNavigate();
  const { notify } = useNotifier();

  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [isUnauthenticated, setIsUnauthenticated] = useState(false);

  // Profile Edit State
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', avatar: '' });
  const [profileSaving, setProfileSaving] = useState(false);

  // Password Change State
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Addresses State
  const [addresses, setAddresses] = useState([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [addressForm, setAddressForm] = useState({
    fullName: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    landmark: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    addressType: 'Home',
    isDefault: false,
  });
  const [addressErrors, setAddressErrors] = useState({});
  const [addressSaving, setAddressSaving] = useState(false);

  // Delete Address State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState(null);
  const [addressDeleting, setAddressDeleting] = useState(false);

  // Orders State
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Fetch User Details with fallback endpoint support
  const fetchUserData = useCallback(async () => {
    const token = localStorage.getItem('MERNEcommerceToken');
    if (!token) {
      setIsUnauthenticated(true);
      setLoading(false);
      return;
    }

    setIsUnauthenticated(false);
    setLoading(true);
    setApiError(null);

    try {
      let res;
      try {
        res = await apiClient.get('auth/me');
      } catch (err1) {
        // Fallback to /user/profile or /auth/profile if /auth/me returns 404
        if (err1.response?.status === 404) {
          res = await apiClient.get('user/profile');
        } else {
          throw err1;
        }
      }

      if (res?.data) {
        setUser(res.data);
        setProfileForm({
          name: res.data.name || '',
          phone: res.data.phone || '',
          avatar: res.data.avatar || res.data.profileImage || '',
        });
      }
    } catch (err) {
      console.error('Account profile fetch error:', err);
      if (err.response?.status === 401) {
        localStorage.removeItem('MERNEcommerceToken');
        setIsUnauthenticated(true);
        notify({ severity: 'warning', message: 'Session expired. Please log in again.' });
      } else {
        setApiError('Unable to load your account information. Please check your network and try again.');
        notify({ severity: 'error', message: 'Failed to load user profile.' });
      }
    } finally {
      setLoading(false);
    }
  }, [notify]);

  // Fetch Addresses
  const fetchAddresses = useCallback(async () => {
    const token = localStorage.getItem('MERNEcommerceToken');
    if (!token) return;

    try {
      setAddressesLoading(true);
      const res = await apiClient.get('address');
      setAddresses(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching addresses:', err);
    } finally {
      setAddressesLoading(false);
    }
  }, []);

  // Fetch Orders
  const fetchOrders = useCallback(async () => {
    const token = localStorage.getItem('MERNEcommerceToken');
    if (!token) return;

    try {
      setOrdersLoading(true);
      const res = await apiClient.get('auth/my-orders');
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const loadAllData = useCallback(() => {
    fetchUserData();
    fetchAddresses();
    fetchOrders();
  }, [fetchUserData, fetchAddresses, fetchOrders]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Handle Profile Update
  const handleProfileSave = async e => {
    e.preventDefault();
    if (!profileForm.name.trim()) {
      notify({ severity: 'error', message: 'Name is required' });
      return;
    }
    setProfileSaving(true);
    try {
      const res = await apiClient.put('auth/profile', profileForm);
      setUser(res.data);
      setEditingProfile(false);
      notify({ severity: 'success', message: 'Profile updated successfully!' });
    } catch (err) {
      notify({ severity: 'error', message: err.response?.data?.msg || 'Failed to update profile' });
    } finally {
      setProfileSaving(false);
    }
  };

  // Handle Password Change
  const handlePasswordChange = async e => {
    e.preventDefault();
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      notify({ severity: 'error', message: 'All fields are required' });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      notify({ severity: 'error', message: 'New password must be at least 6 characters' });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      notify({ severity: 'error', message: 'New passwords do not match' });
      return;
    }
    setPasswordSaving(true);
    try {
      await apiClient.put('auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      notify({ severity: 'success', message: 'Password changed successfully!' });
    } catch (err) {
      notify({ severity: 'error', message: err.response?.data?.msg || 'Failed to change password' });
    } finally {
      setPasswordSaving(false);
    }
  };

  // Open Dialog for New Address
  const handleOpenNewAddress = () => {
    setEditingAddressId(null);
    setAddressForm({
      fullName: user?.name || '',
      phone: user?.phone || '',
      addressLine1: '',
      addressLine2: '',
      landmark: '',
      city: '',
      state: '',
      pincode: '',
      country: 'India',
      addressType: 'Home',
      isDefault: addresses.length === 0,
    });
    setAddressErrors({});
    setAddressDialogOpen(true);
  };

  // Open Dialog for Editing Address
  const handleOpenEditAddress = address => {
    setEditingAddressId(address._id);
    setAddressForm({
      fullName: address.fullName || '',
      phone: address.phone || '',
      addressLine1: address.addressLine1 || '',
      addressLine2: address.addressLine2 || '',
      landmark: address.landmark || '',
      city: address.city || '',
      state: address.state || '',
      pincode: address.pincode || '',
      country: address.country || 'India',
      addressType: address.addressType || 'Home',
      isDefault: Boolean(address.isDefault),
    });
    setAddressErrors({});
    setAddressDialogOpen(true);
  };

  // Validate Address Form
  const validateAddressForm = () => {
    const errors = {};
    if (!addressForm.fullName.trim()) errors.fullName = 'Full name is required';
    if (!addressForm.phone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!/^[0-9+-\s()]{7,15}$/.test(addressForm.phone.trim())) {
      errors.phone = 'Enter a valid phone number';
    }
    if (!addressForm.addressLine1.trim()) errors.addressLine1 = 'House/Flat/Building is required';
    if (!addressForm.city.trim()) errors.city = 'City is required';
    if (!addressForm.state.trim()) errors.state = 'State is required';
    if (!addressForm.pincode.trim()) {
      errors.pincode = 'Pincode is required';
    } else if (!/^[0-9]{4,10}$/.test(addressForm.pincode.trim())) {
      errors.pincode = 'Enter a valid postal pincode';
    }
    setAddressErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save Address (Create or Update)
  const handleSaveAddress = async e => {
    e.preventDefault();
    if (!validateAddressForm()) return;

    setAddressSaving(true);
    try {
      if (editingAddressId) {
        await apiClient.put(`address/${editingAddressId}`, addressForm);
        notify({ severity: 'success', message: 'Address updated successfully!' });
      } else {
        await apiClient.post('address', addressForm);
        notify({ severity: 'success', message: 'Address added successfully!' });
      }
      setAddressDialogOpen(false);
      fetchAddresses();
    } catch (err) {
      notify({
        severity: 'error',
        message: err.response?.data?.msg || err.response?.data?.errors?.[0]?.msg || 'Failed to save address',
      });
    } finally {
      setAddressSaving(false);
    }
  };

  // Set Address as Default
  const handleSetDefaultAddress = async id => {
    try {
      await apiClient.put(`address/${id}/default`);
      notify({ severity: 'success', message: 'Default address updated!' });
      fetchAddresses();
    } catch (err) {
      notify({ severity: 'error', message: 'Failed to set default address' });
    }
  };

  // Confirm Delete Address
  const handleConfirmDelete = async () => {
    if (!addressToDelete) return;
    setAddressDeleting(true);
    try {
      await apiClient.delete(`address/${addressToDelete._id}`);
      notify({ severity: 'success', message: 'Address deleted successfully!' });
      setDeleteConfirmOpen(false);
      setAddressToDelete(null);
      fetchAddresses();
    } catch (err) {
      notify({ severity: 'error', message: 'Failed to delete address' });
    } finally {
      setAddressDeleting(false);
    }
  };

  // Sign out
  const handleLogout = () => {
    const prevUserId = getCurrentUserId();
    clearUserSessionData(prevUserId);
    localStorage.removeItem('MERNEcommerceToken');
    setUser(null);
    setAddresses([]);
    setOrders([]);
    setIsUnauthenticated(true);
    notifyAuthChange('logout');
    notify({ severity: 'success', message: 'Signed out successfully.' });
    navigate('/');
  };

  const getAddressTypeIcon = type => {
    switch (type) {
      case 'Work':
        return <WorkIcon fontSize="small" sx={{ mr: 0.5 }} />;
      case 'Other':
        return <PlaceIcon fontSize="small" sx={{ mr: 0.5 }} />;
      default:
        return <HomeIcon fontSize="small" sx={{ mr: 0.5 }} />;
    }
  };

  const memberSinceString = user?.date || user?.createdAt
    ? new Date(user.date || user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Not provided';

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 8 }}>
      {/* 1. Header Banner - ALWAYS RENDERS */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 3, md: 4 },
          mb: 4,
          borderRadius: 3,
          background: '#1d1d1f',
          color: 'white',
        }}
      >
        <Grid container spacing={3} alignItems="center">
          <Grid item>
            {loading ? (
              <Skeleton variant="circular" width={80} height={80} sx={{ bgcolor: 'rgba(255,255,255,0.2)' }} />
            ) : (
              <Avatar
                src={user?.avatar || user?.profileImage || ''}
                alt={user?.name || 'User'}
                sx={{ width: { xs: 70, md: 85 }, height: { xs: 70, md: 85 }, bgcolor: '#2d2d30', fontSize: '2rem' }}
              >
                {user?.name ? user.name.charAt(0).toUpperCase() : <PersonIcon fontSize="large" />}
              </Avatar>
            )}
          </Grid>
          <Grid item xs>
            <Typography variant="overline" sx={{ letterSpacing: 1.5, opacity: 0.8, fontWeight: 600 }}>
              My Account
            </Typography>
            <Typography variant="h4" fontWeight={700} sx={{ fontSize: { xs: '1.5rem', md: '2.1rem' } }}>
              {loading ? (
                <Skeleton width="60%" sx={{ bgcolor: 'rgba(255,255,255,0.2)' }} />
              ) : user?.name ? (
                user.name
              ) : isUnauthenticated ? (
                'Guest User'
              ) : (
                'Account Details'
              )}
            </Typography>

            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {loading ? (
                  <Skeleton width={180} sx={{ bgcolor: 'rgba(255,255,255,0.2)' }} />
                ) : user?.email ? (
                  user.email
                ) : (
                  'Email: Not available'
                )}
              </Typography>

              {user ? (
                user.emailVerified ? (
                  <Chip
                    icon={<CheckCircleIcon sx={{ '&&': { color: '#10b981' } }} />}
                    label="Verified"
                    size="small"
                    sx={{ bgcolor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontWeight: 600 }}
                  />
                ) : (
                  <Chip
                    icon={<WarningAmberIcon sx={{ '&&': { color: '#f59e0b' } }} />}
                    label="Unverified"
                    size="small"
                    sx={{ bgcolor: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', fontWeight: 600 }}
                  />
                )
              ) : null}
            </Stack>

            <Typography variant="caption" sx={{ opacity: 0.75, display: 'block', mt: 0.5 }}>
              Member Since: {loading ? 'Loading…' : memberSinceString}
            </Typography>
          </Grid>

          <Grid item>
            {user ? (
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<LogoutIcon />}
                onClick={handleLogout}
                sx={{
                  borderColor: 'rgba(255,255,255,0.4)',
                  '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' },
                }}
              >
                Sign out
              </Button>
            ) : (
              <Button
                variant="contained"
                color="primary"
                component={Link}
                to="/login"
                startIcon={<LoginIcon />}
                sx={{ bgcolor: 'white', color: '#1d1d1f', '&:hover': { bgcolor: '#f5f5f7' } }}
              >
                Sign In
              </Button>
            )}
          </Grid>
        </Grid>
      </Paper>

      {/* 2. Unauthenticated Banner */}
      {isUnauthenticated && (
        <Paper elevation={0} sx={{ p: 4, mb: 4, textAlign: 'center', borderRadius: 3, border: '1px solid #fed7aa', bgcolor: '#fffbeb' }}>
          <Typography variant="h6" fontWeight={700} gutterBottom color="warning.dark">
            Please log in to view your account
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Sign in with your email and password to access your saved addresses, past orders, and profile security settings.
          </Typography>
          <Stack direction="row" spacing={2} justifyContent="center">
            <Button variant="contained" color="primary" component={Link} to="/login" startIcon={<LoginIcon />}>
              Sign In to Account
            </Button>
            <Button variant="outlined" color="inherit" component={Link} to="/register">
              Create New Account
            </Button>
          </Stack>
        </Paper>
      )}

      {/* 3. API Error Banner with Retry */}
      {apiError && (
        <Alert
          severity="error"
          sx={{ mb: 3, borderRadius: 2 }}
          action={
            <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={loadAllData}>
              Try Again
            </Button>
          }
        >
          {apiError}
        </Alert>
      )}

      {/* 4. Tabs Section - ALWAYS RENDERS */}
      <Paper elevation={1} sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Tabs
          value={tabValue}
          onChange={(e, val) => setTabValue(val)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2, bgcolor: '#fafafa' }}
        >
          <Tab icon={<PersonIcon />} iconPosition="start" label="Profile" />
          <Tab icon={<LocationOnIcon />} iconPosition="start" label={`Saved Addresses (${addresses.length})`} />
          <Tab icon={<SecurityIcon />} iconPosition="start" label="Security" />
          <Tab icon={<ShoppingBagIcon />} iconPosition="start" label={`My Orders (${orders.length})`} />
        </Tabs>

        <Box sx={{ p: { xs: 2.5, md: 4 } }}>
          {/* TAB 0: PROFILE */}
          <TabPanel value={tabValue} index={0}>
            <Grid container spacing={4}>
              <Grid item xs={12} md={7}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                  <Typography variant="h6" fontWeight={700}>
                    Personal Information
                  </Typography>
                  {user && !editingProfile && (
                    <Button startIcon={<EditIcon />} variant="outlined" size="small" onClick={() => setEditingProfile(true)}>
                      Edit Profile
                    </Button>
                  )}
                  {user && editingProfile && (
                    <Button variant="text" size="small" onClick={() => setEditingProfile(false)}>
                      Cancel
                    </Button>
                  )}
                </Box>

                {loading ? (
                  <Stack spacing={2.5}>
                    <Skeleton variant="rectangular" height={40} />
                    <Skeleton variant="rectangular" height={40} />
                    <Skeleton variant="rectangular" height={40} />
                  </Stack>
                ) : !editingProfile ? (
                  <Stack spacing={2.5}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Full Name
                      </Typography>
                      <Typography variant="body1" fontWeight={600}>
                        {user?.name || (isUnauthenticated ? 'Please log in' : 'Not available')}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Email Address
                      </Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body1" fontWeight={600}>
                          {user?.email || (isUnauthenticated ? 'Please log in' : 'Not available')}
                        </Typography>
                        {user ? (
                          user.emailVerified ? (
                            <Chip label="✓ Verified" size="small" color="success" variant="outlined" sx={{ fontWeight: 600 }} />
                          ) : (
                            <Button
                              size="small"
                              variant="contained"
                              color="warning"
                              onClick={() => navigate(`/verify-email?email=${encodeURIComponent(user.email)}`)}
                              sx={{ py: 0.2, px: 1.2, fontSize: '0.75rem' }}
                            >
                              Verify Now
                            </Button>
                          )
                        ) : null}
                      </Stack>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Phone Number
                      </Typography>
                      <Typography variant="body1" fontWeight={600}>
                        {user?.phone || 'Not provided'}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Member Since
                      </Typography>
                      <Typography variant="body1" fontWeight={600}>
                        {memberSinceString}
                      </Typography>
                    </Box>
                  </Stack>
                ) : (
                  <form onSubmit={handleProfileSave}>
                    <Stack spacing={2.5}>
                      <TextField
                        label="Full Name"
                        value={profileForm.name}
                        onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                        required
                        fullWidth
                      />
                      <TextField
                        label="Phone Number"
                        placeholder="+91 98765 43210"
                        value={profileForm.phone}
                        onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                        fullWidth
                      />
                      <TextField
                        label="Avatar Image URL (optional)"
                        placeholder="https://example.com/avatar.jpg"
                        value={profileForm.avatar}
                        onChange={e => setProfileForm({ ...profileForm, avatar: e.target.value })}
                        fullWidth
                      />
                      <Button type="submit" variant="contained" disabled={profileSaving} sx={{ alignSelf: 'flex-start' }}>
                        {profileSaving ? <CircularProgress size={22} /> : 'Save Changes'}
                      </Button>
                    </Stack>
                  </form>
                )}
              </Grid>

              {/* Email Verification Section */}
              <Grid item xs={12} md={5}>
                <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, bgcolor: '#f8fafc' }}>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                    Email Verification
                  </Typography>

                  {loading ? (
                    <Skeleton variant="rectangular" height={80} />
                  ) : user?.emailVerified ? (
                    <Alert severity="success" sx={{ mb: 2 }}>
                      ✓ <strong>Email Verified</strong>
                      <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                        Your email address ({user.email}) is fully verified and protected.
                      </Typography>
                    </Alert>
                  ) : user ? (
                    <Box>
                      <Alert severity="warning" sx={{ mb: 2 }}>
                        ⚠ <strong>Email Not Verified</strong>
                        <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                          Please verify your email address to ensure account security.
                        </Typography>
                      </Alert>
                      <Button
                        variant="contained"
                        color="warning"
                        fullWidth
                        onClick={() => navigate(`/verify-email?email=${encodeURIComponent(user.email)}`)}
                      >
                        Verify Email (Enter OTP)
                      </Button>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Email verification status will appear once you log in.
                    </Typography>
                  )}
                </Paper>
              </Grid>
            </Grid>
          </TabPanel>

          {/* TAB 1: SAVED ADDRESSES */}
          <TabPanel value={tabValue} index={1}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <div>
                <Typography variant="h6" fontWeight={700}>
                  Saved Addresses
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Manage your delivery locations for faster checkout.
                </Typography>
              </div>
              {user && (
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenNewAddress}>
                  + Add New Address
                </Button>
              )}
            </Box>

            {addressesLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : isUnauthenticated ? (
              <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 3, bgcolor: '#f8fafc' }}>
                <LocationOnIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  Please sign in to view saved addresses
                </Typography>
                <Button variant="contained" component={Link} to="/login" sx={{ mt: 1 }}>
                  Sign In
                </Button>
              </Paper>
            ) : addresses.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', borderRadius: 3, bgcolor: '#f8fafc' }}>
                <LocationOnIcon sx={{ fontSize: 50, color: 'text.secondary', mb: 1 }} />
                <Typography variant="h6" gutterBottom>
                  No addresses saved yet
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Add your home or work address for quick one-click checkout.
                </Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenNewAddress}>
                  Add Your First Address
                </Button>
              </Paper>
            ) : (
              <Grid container spacing={2.5}>
                {addresses.map(address => (
                  <Grid item xs={12} sm={6} md={4} key={address._id}>
                    <Card
                      variant="outlined"
                      sx={{
                        borderRadius: 3,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        borderColor: address.isDefault ? 'primary.main' : 'divider',
                        boxShadow: address.isDefault ? '0 2px 12px rgba(0, 0, 0, 0.08)' : 'none',
                      }}
                    >
                      <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                          <Chip
                            icon={getAddressTypeIcon(address.addressType)}
                            label={address.addressType || 'Home'}
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 600 }}
                          />
                          {address.isDefault && (
                            <Chip
                              icon={<StarIcon sx={{ '&&': { color: '#1d1d1f' } }} />}
                              label="Default"
                              size="small"
                              color="primary"
                              sx={{ fontWeight: 700 }}
                            />
                          )}
                        </Stack>

                        <Typography variant="subtitle1" fontWeight={700}>
                          {address.fullName || 'Not provided'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          📞 {address.phone || 'Not provided'}
                        </Typography>

                        <Typography variant="body2" sx={{ color: 'text.primary', lineHeight: 1.6 }}>
                          {address.addressLine1}
                          {address.addressLine2 && `, ${address.addressLine2}`}
                          {address.landmark && ` (Near ${address.landmark})`}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {address.city}, {address.state} - {address.pincode}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          {address.country || 'India'}
                        </Typography>
                      </CardContent>

                      <Divider />

                      <CardActions sx={{ px: 2, py: 1, justifyContent: 'space-between' }}>
                        <Stack direction="row" spacing={1}>
                          <Tooltip title="Edit Address">
                            <IconButton size="small" color="primary" onClick={() => handleOpenEditAddress(address)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete Address">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => {
                                setAddressToDelete(address);
                                setDeleteConfirmOpen(true);
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>

                        {!address.isDefault && (
                          <Button size="small" variant="text" onClick={() => handleSetDefaultAddress(address._id)}>
                            Set as Default
                          </Button>
                        )}
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </TabPanel>

          {/* TAB 2: SECURITY */}
          <TabPanel value={tabValue} index={2}>
            <Grid container spacing={4}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" fontWeight={700} gutterBottom>
                  Change Password
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Ensure your account is using a strong, unique password.
                </Typography>

                {isUnauthenticated ? (
                  <Alert severity="info">Please sign in to update your security settings.</Alert>
                ) : (
                  <form onSubmit={handlePasswordChange}>
                    <Stack spacing={2.5}>
                      <TextField
                        type="password"
                        label="Current Password"
                        value={passwordForm.currentPassword}
                        onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                        required
                        fullWidth
                      />
                      <TextField
                        type="password"
                        label="New Password"
                        helperText="Must be at least 6 characters"
                        value={passwordForm.newPassword}
                        onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                        required
                        fullWidth
                      />
                      <TextField
                        type="password"
                        label="Confirm New Password"
                        value={passwordForm.confirmPassword}
                        onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                        required
                        fullWidth
                      />
                      <Button type="submit" variant="contained" disabled={passwordSaving} sx={{ alignSelf: 'flex-start' }}>
                        {passwordSaving ? <CircularProgress size={22} /> : 'Update Password'}
                      </Button>
                    </Stack>
                  </form>
                )}
              </Grid>

              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, bgcolor: '#f8fafc' }}>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                    Account Security Overview
                  </Typography>
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Email OTP Verification</Typography>
                      <Chip
                        label={user?.emailVerified ? 'Verified' : 'Pending'}
                        color={user?.emailVerified ? 'success' : 'warning'}
                        size="small"
                      />
                    </Box>
                    <Divider />
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Authentication Method</Typography>
                      <Chip label="JWT Bearer Token" color="primary" variant="outlined" size="small" />
                    </Box>
                    <Divider />
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Password Security</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Hashed with bcrypt
                      </Typography>
                    </Box>
                    {user && (
                      <>
                        <Divider />
                        <Button
                          variant="outlined"
                          color="error"
                          startIcon={<LogoutIcon />}
                          onClick={handleLogout}
                          sx={{ alignSelf: 'flex-start' }}
                        >
                          Sign Out of All Sessions
                        </Button>
                      </>
                    )}
                  </Stack>
                </Paper>
              </Grid>
            </Grid>
          </TabPanel>

          {/* TAB 3: MY ORDERS */}
          <TabPanel value={tabValue} index={3}>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              My Orders
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Track past and active purchases placed with your account email.
            </Typography>

            {ordersLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : isUnauthenticated ? (
              <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 3, bgcolor: '#f8fafc' }}>
                <ShoppingBagIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  Sign in to view your orders
                </Typography>
                <Button variant="contained" component={Link} to="/login" sx={{ mt: 1 }}>
                  Sign In
                </Button>
              </Paper>
            ) : orders.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 3, bgcolor: '#f8fafc' }}>
                <ShoppingBagIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                <Typography variant="subtitle1" fontWeight={600}>
                  No orders placed yet
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Your purchases will appear here once you place an order.
                </Typography>
                <Button variant="contained" onClick={() => navigate('/shop')}>
                  Start Shopping
                </Button>
              </Paper>
            ) : (
              <Stack spacing={2.5}>
                {orders.map(order => {
                  const orderDate = order.createdAt || order.date
                    ? new Date(order.createdAt || order.date).toLocaleDateString()
                    : 'Not available';
                  return (
                    <Paper key={order._id || order.orderNumber} variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                      <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={3}>
                          <Typography variant="caption" color="text.secondary">
                            Order ID
                          </Typography>
                          <Typography variant="subtitle2" fontWeight={700}>
                            #{order.orderNumber || order._id}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Date: {orderDate}
                          </Typography>
                        </Grid>

                        <Grid item xs={12} sm={3}>
                          <Typography variant="caption" color="text.secondary">
                            Total
                          </Typography>
                          <Typography variant="subtitle1" fontWeight={700} color="primary.main">
                            ₹{((order.total || 0) * 90).toFixed(2)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Payment: {order.paymentMethod === 'razorpay' ? 'Razorpay/UPI' : 'Card'} ({order.paymentStatus || 'paid'})
                          </Typography>
                        </Grid>

                        <Grid item xs={12} sm={4}>
                          <Typography variant="caption" color="text.secondary">
                            Shipping To
                          </Typography>
                          <Typography variant="body2" noWrap title={order.shippingAddress || 'Not provided'}>
                            {order.shippingAddress || 'Not provided'}
                          </Typography>
                          {order.items && order.items.length > 0 && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              {order.items.length} item{order.items.length > 1 ? 's' : ''}: {order.items.map(i => i.name).join(', ')}
                            </Typography>
                          )}
                        </Grid>

                        <Grid item xs={12} sm={2} sx={{ textAlign: { sm: 'right' } }}>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() =>
                              navigate(
                                `/order-tracking?order=${order.orderNumber || order._id}&email=${encodeURIComponent(
                                  order.email || user?.email || ''
                                )}`
                              )
                            }
                          >
                            Track Order
                          </Button>
                        </Grid>
                      </Grid>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </TabPanel>
        </Box>
      </Paper>

      {/* DIALOG: ADD / EDIT ADDRESS */}
      <Dialog open={addressDialogOpen} onClose={() => setAddressDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSaveAddress}>
          <DialogTitle sx={{ fontWeight: 700 }}>
            {editingAddressId ? 'Edit Delivery Address' : 'Add New Delivery Address'}
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Full Name"
                    fullWidth
                    required
                    value={addressForm.fullName}
                    onChange={e => setAddressForm({ ...addressForm, fullName: e.target.value })}
                    error={Boolean(addressErrors.fullName)}
                    helperText={addressErrors.fullName}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Phone Number"
                    fullWidth
                    required
                    placeholder="10-digit mobile number"
                    value={addressForm.phone}
                    onChange={e => setAddressForm({ ...addressForm, phone: e.target.value })}
                    error={Boolean(addressErrors.phone)}
                    helperText={addressErrors.phone}
                  />
                </Grid>
              </Grid>

              <TextField
                label="House / Flat / Building / Floor"
                fullWidth
                required
                value={addressForm.addressLine1}
                onChange={e => setAddressForm({ ...addressForm, addressLine1: e.target.value })}
                error={Boolean(addressErrors.addressLine1)}
                helperText={addressErrors.addressLine1}
              />

              <TextField
                label="Street / Area / Colony (Address Line 2)"
                fullWidth
                value={addressForm.addressLine2}
                onChange={e => setAddressForm({ ...addressForm, addressLine2: e.target.value })}
              />

              <TextField
                label="Landmark (Optional)"
                placeholder="e.g. Near City Center"
                fullWidth
                value={addressForm.landmark}
                onChange={e => setAddressForm({ ...addressForm, landmark: e.target.value })}
              />

              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="City"
                    fullWidth
                    required
                    value={addressForm.city}
                    onChange={e => setAddressForm({ ...addressForm, city: e.target.value })}
                    error={Boolean(addressErrors.city)}
                    helperText={addressErrors.city}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="State"
                    fullWidth
                    required
                    value={addressForm.state}
                    onChange={e => setAddressForm({ ...addressForm, state: e.target.value })}
                    error={Boolean(addressErrors.state)}
                    helperText={addressErrors.state}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Pincode / ZIP"
                    fullWidth
                    required
                    value={addressForm.pincode}
                    onChange={e => setAddressForm({ ...addressForm, pincode: e.target.value })}
                    error={Boolean(addressErrors.pincode)}
                    helperText={addressErrors.pincode}
                  />
                </Grid>
              </Grid>

              <TextField
                label="Country"
                fullWidth
                required
                value={addressForm.country}
                onChange={e => setAddressForm({ ...addressForm, country: e.target.value })}
              />

              <FormControl component="fieldset" sx={{ mt: 1 }}>
                <FormLabel component="legend">Address Type</FormLabel>
                <RadioGroup
                  row
                  value={addressForm.addressType}
                  onChange={e => setAddressForm({ ...addressForm, addressType: e.target.value })}
                >
                  <FormControlLabel value="Home" control={<Radio />} label="Home 🏠" />
                  <FormControlLabel value="Work" control={<Radio />} label="Work 💼" />
                  <FormControlLabel value="Other" control={<Radio />} label="Other 📍" />
                </RadioGroup>
              </FormControl>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={addressForm.isDefault}
                    onChange={e => setAddressForm({ ...addressForm, isDefault: e.target.checked })}
                    color="primary"
                  />
                }
                label="Set as default address"
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setAddressDialogOpen(false)} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={addressSaving}>
              {addressSaving ? <CircularProgress size={22} /> : editingAddressId ? 'Save Changes' : 'Add Address'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* DIALOG: CONFIRM DELETE ADDRESS */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Address?</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            Are you sure you want to delete this address?
          </Typography>
          {addressToDelete && (
            <Box sx={{ mt: 1.5, p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                {addressToDelete.fullName} ({addressToDelete.addressType})
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {addressToDelete.addressLine1}, {addressToDelete.city}, {addressToDelete.state} - {addressToDelete.pincode}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained" disabled={addressDeleting}>
            {addressDeleting ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default Account;
