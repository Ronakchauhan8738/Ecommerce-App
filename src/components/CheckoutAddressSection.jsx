import React, { useState, useEffect, useCallback } from 'react';
import {
  Paper,
  Typography,
  Box,
  Grid,
  Radio,
  RadioGroup,
  FormControlLabel,
  Card,
  CardContent,
  Chip,
  Button,
  TextField,
  Stack,
  Checkbox,
  CircularProgress,
  Collapse,
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import WorkIcon from '@mui/icons-material/Work';
import PlaceIcon from '@mui/icons-material/Place';
import StarIcon from '@mui/icons-material/Star';
import AddLocationAltIcon from '@mui/icons-material/AddLocationAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { apiClient } from '../services/apiClient';

function formatAddressString(addr) {
  const parts = [
    addr.fullName ? `${addr.fullName}` : '',
    addr.phone ? `Ph: ${addr.phone}` : '',
    addr.addressLine1,
    addr.addressLine2,
    addr.landmark ? `Near ${addr.landmark}` : '',
    `${addr.city}, ${addr.state} - ${addr.pincode}`,
    addr.country || 'India',
  ].filter(Boolean);
  return parts.join(', ');
}

function CheckoutAddressSection({ onChange, emailValue = '', onEmailChange }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addresses, setAddresses] = useState([]);
  const [userProfile, setUserProfile] = useState(null);

  // 'saved:<id>' or 'new'
  const [selectedOption, setSelectedOption] = useState('new');

  // New Address Form State
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [newAddress, setNewAddress] = useState({
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
    saveToAccount: true,
  });

  // Guest Address State
  const [guestAddress, setGuestAddress] = useState({
    name: '',
    email: emailValue,
    shippingAddress: '',
  });

  // Fetch saved addresses & user profile if logged in
  const loadUserData = useCallback(async () => {
    const token = localStorage.getItem('MERNEcommerceToken');
    if (!token) {
      setIsLoggedIn(false);
      setLoading(false);
      return;
    }

    setIsLoggedIn(true);
    setLoading(true);

    try {
      const [addrRes, userRes] = await Promise.all([
        apiClient.get('address').catch(() => ({ data: [] })),
        apiClient.get('auth/me').catch(() => ({ data: null })),
      ]);

      const savedAddrs = addrRes.data || [];
      const user = userRes.data || null;

      setAddresses(savedAddrs);
      setUserProfile(user);

      if (user?.email && onEmailChange) {
        onEmailChange(user.email);
      }

      if (savedAddrs.length > 0) {
        // Pre-select default address or first address
        const defaultAddr = savedAddrs.find(a => a.isDefault) || savedAddrs[0];
        setSelectedOption(`saved:${defaultAddr._id}`);
        setShowNewAddressForm(false);

        onChange?.({
          name: defaultAddr.fullName,
          email: user?.email || emailValue,
          phone: defaultAddr.phone,
          shippingAddress: formatAddressString(defaultAddr),
          selectedAddressId: defaultAddr._id,
        });
      } else {
        setSelectedOption('new');
        setShowNewAddressForm(true);
        if (user) {
          setNewAddress(prev => ({
            ...prev,
            fullName: user.name || '',
            phone: user.phone || '',
          }));
        }
      }
    } catch (err) {
      console.error('Error loading checkout user data:', err);
    } finally {
      setLoading(false);
    }
  }, [onChange, onEmailChange, emailValue]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // Handle selecting a saved address
  const handleSelectSavedAddress = address => {
    setSelectedOption(`saved:${address._id}`);
    setShowNewAddressForm(false);

    onChange?.({
      name: address.fullName,
      email: userProfile?.email || emailValue,
      phone: address.phone,
      shippingAddress: formatAddressString(address),
      selectedAddressId: address._id,
    });
  };

  // Handle switching to "Use new address"
  const handleSelectNewOption = () => {
    setSelectedOption('new');
    setShowNewAddressForm(true);
    propagateNewAddressChange(newAddress);
  };

  // Propagate new address fields to parent
  const propagateNewAddressChange = updated => {
    const formatted = formatAddressString(updated);
    onChange?.({
      name: updated.fullName,
      email: userProfile?.email || emailValue,
      phone: updated.phone,
      shippingAddress: formatted,
      selectedAddressId: null,
      saveAddressData: updated.saveToAccount ? updated : null,
    });
  };

  // Handle new address form input change
  const handleNewAddressInputChange = e => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;
    const updated = { ...newAddress, [name]: val };
    setNewAddress(updated);
    propagateNewAddressChange(updated);
  };

  // Handle Guest input change
  const handleGuestInputChange = e => {
    const { name, value } = e.target;
    const updated = { ...guestAddress, [name]: value };
    setGuestAddress(updated);
    if (name === 'email' && onEmailChange) {
      onEmailChange(value);
    }
    onChange?.({
      name: updated.name,
      email: updated.email,
      shippingAddress: updated.shippingAddress,
      selectedAddressId: null,
    });
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

  if (loading) {
    return (
      <Paper elevation={0} sx={{ p: 3, mb: 4, borderRadius: 3, background: 'rgba(0,0,0,0.02)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <CircularProgress size={24} />
          <Typography variant="body2">Loading delivery details…</Typography>
        </Box>
      </Paper>
    );
  }

  // --- LOGGED IN VIEW ---
  if (isLoggedIn) {
    return (
      <Paper elevation={0} sx={{ mb: 4, borderRadius: 3, p: 3, background: 'rgba(0,0,0,0.02)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight={700}>
            1. Delivery Address
          </Typography>
          {addresses.length > 0 && !showNewAddressForm && (
            <Button
              size="small"
              startIcon={<AddLocationAltIcon />}
              variant="outlined"
              onClick={handleSelectNewOption}
            >
              + Add / Use New Address
            </Button>
          )}
        </Box>

        {addresses.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Grid container spacing={2}>
              {addresses.map(addr => {
                const isSelected = selectedOption === `saved:${addr._id}`;
                return (
                  <Grid item xs={12} sm={6} key={addr._id}>
                    <Card
                      variant="outlined"
                      onClick={() => handleSelectSavedAddress(addr)}
                      sx={{
                        p: 1.5,
                        cursor: 'pointer',
                        borderRadius: 3,
                        borderColor: isSelected ? 'primary.main' : 'divider',
                        borderWidth: isSelected ? 2 : 1,
                        bgcolor: isSelected ? 'rgba(0, 0, 0, 0.04)' : 'background.paper',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          borderColor: 'primary.main',
                        },
                      }}
                    >
                      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Radio
                              checked={isSelected}
                              onChange={() => handleSelectSavedAddress(addr)}
                              size="small"
                              sx={{ p: 0.5 }}
                            />
                            <Chip
                              icon={getAddressTypeIcon(addr.addressType)}
                              label={addr.addressType}
                              size="small"
                              variant="outlined"
                              sx={{ fontWeight: 600 }}
                            />
                            {addr.isDefault && (
                              <Chip
                                icon={<StarIcon sx={{ '&&': { color: '#ffffff' } }} />}
                                label="Default"
                                size="small"
                                color="primary"
                                sx={{ fontWeight: 700, height: 22 }}
                              />
                            )}
                          </Stack>
                          {isSelected && (
                            <Chip
                              icon={<CheckCircleIcon sx={{ '&&': { color: '#10b981' } }} />}
                              label="Deliver Here"
                              size="small"
                              sx={{ bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#059669', fontWeight: 600 }}
                            />
                          )}
                        </Stack>

                        <Typography variant="subtitle2" fontWeight={700}>
                          {addr.fullName} &nbsp;
                          <Typography component="span" variant="body2" color="text.secondary">
                            ({addr.phone})
                          </Typography>
                        </Typography>

                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {addr.addressLine1}
                          {addr.addressLine2 && `, ${addr.addressLine2}`}
                          {addr.landmark && ` (Near ${addr.landmark})`}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {addr.city}, {addr.state} - {addr.pincode}, {addr.country}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        )}

        {/* Option to use a new address or inline new address form */}
        <Collapse in={showNewAddressForm || addresses.length === 0}>
          <Box sx={{ mt: 2, p: 2.5, bgcolor: 'background.paper', borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={700}>
                Enter New Delivery Address
              </Typography>
              {addresses.length > 0 && (
                <Button size="small" variant="text" onClick={() => handleSelectSavedAddress(addresses.find(a => a.isDefault) || addresses[0])}>
                  ← Back to Saved Addresses
                </Button>
              )}
            </Box>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Full Name"
                  name="fullName"
                  fullWidth
                  required
                  size="small"
                  value={newAddress.fullName}
                  onChange={handleNewAddressInputChange}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Phone Number"
                  name="phone"
                  fullWidth
                  required
                  size="small"
                  placeholder="10-digit mobile"
                  value={newAddress.phone}
                  onChange={handleNewAddressInputChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="House / Flat / Building / Floor"
                  name="addressLine1"
                  fullWidth
                  required
                  size="small"
                  value={newAddress.addressLine1}
                  onChange={handleNewAddressInputChange}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Street / Area / Colony"
                  name="addressLine2"
                  fullWidth
                  size="small"
                  value={newAddress.addressLine2}
                  onChange={handleNewAddressInputChange}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Landmark (Optional)"
                  name="landmark"
                  fullWidth
                  size="small"
                  value={newAddress.landmark}
                  onChange={handleNewAddressInputChange}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="City"
                  name="city"
                  fullWidth
                  required
                  size="small"
                  value={newAddress.city}
                  onChange={handleNewAddressInputChange}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="State"
                  name="state"
                  fullWidth
                  required
                  size="small"
                  value={newAddress.state}
                  onChange={handleNewAddressInputChange}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Pincode / ZIP"
                  name="pincode"
                  fullWidth
                  required
                  size="small"
                  value={newAddress.pincode}
                  onChange={handleNewAddressInputChange}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Country"
                  name="country"
                  fullWidth
                  size="small"
                  value={newAddress.country}
                  onChange={handleNewAddressInputChange}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <RadioGroup
                  row
                  name="addressType"
                  value={newAddress.addressType}
                  onChange={handleNewAddressInputChange}
                  sx={{ mt: 0.5 }}
                >
                  <FormControlLabel value="Home" control={<Radio size="small" />} label="Home" />
                  <FormControlLabel value="Work" control={<Radio size="small" />} label="Work" />
                  <FormControlLabel value="Other" control={<Radio size="small" />} label="Other" />
                </RadioGroup>
              </Grid>
            </Grid>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    name="saveToAccount"
                    checked={newAddress.saveToAccount}
                    onChange={handleNewAddressInputChange}
                    color="primary"
                    size="small"
                  />
                }
                label="Save this address for future orders"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    name="isDefault"
                    checked={newAddress.isDefault}
                    onChange={handleNewAddressInputChange}
                    color="primary"
                    size="small"
                  />
                }
                label="Set as default address"
              />
            </Stack>
          </Box>
        </Collapse>
      </Paper>
    );
  }

  // --- GUEST VIEW (NOT LOGGED IN) ---
  return (
    <Paper elevation={0} sx={{ mb: 4, borderRadius: 3, p: 3, background: 'rgba(0,0,0,0.02)' }}>
      <Typography variant="h6" fontWeight={700} gutterBottom>
        1. Contact & Shipping Details
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            required
            fullWidth
            label="Full Name"
            name="name"
            value={guestAddress.name}
            onChange={handleGuestInputChange}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            required
            fullWidth
            label="Email Address"
            name="email"
            type="email"
            value={guestAddress.email}
            onChange={handleGuestInputChange}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            required
            fullWidth
            multiline
            rows={2}
            label="Shipping Address (House, Street, City, State, Pincode)"
            name="shippingAddress"
            value={guestAddress.shippingAddress}
            onChange={handleGuestInputChange}
          />
        </Grid>
      </Grid>
    </Paper>
  );
}

export default CheckoutAddressSection;
