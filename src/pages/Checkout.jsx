import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CheckoutForm from '../components/CheckoutForm';
import RazorpayCheckout from '../components/RazorpayCheckout';
import CheckoutAddressSection from '../components/CheckoutAddressSection';
import {
  Typography,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Divider,
  Box,
  IconButton,
  Collapse,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Checkbox,
  Tooltip,
  ButtonBase,
  Button,
} from '@mui/material';
import ShoppingCartCheckoutIcon from '@mui/icons-material/ShoppingCartCheckout';
import LockIcon from '@mui/icons-material/Lock';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LoginIcon from '@mui/icons-material/Login';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { useNotifier } from '../context/NotificationProvider';
import { apiClient, withRetry } from '../services/apiClient';
import { setUserItem, getAuthToken } from '../utils/userStorage';

function Checkout({ cartItems = [], onOrderComplete }) {
  const navigate = useNavigate();
  const [orderCreated, setOrderCreated] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { notify } = useNotifier();

  const [showCartSummary, setShowCartSummary] = useState(false);
  const [selectedItems, setSelectedItems] = useState(() => {
    const defaults = cartItems.map(item => item._id || item.id).filter(Boolean);
    return new Set(defaults);
  });

  // Payment method state
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [deliveryInfo, setDeliveryInfo] = useState(null);

  // GUEST AUTH GUARD: Block checkout for unauthenticated users and prompt Login / Register
  if (!getAuthToken()) {
    return (
      <Container maxWidth="md" sx={{ pb: 10, mt: 4 }}>
        <Paper elevation={0} sx={{ p: { xs: 4, md: 6 }, borderRadius: 4, border: '1px solid rgba(0,0,0,0.08)', textAlign: 'center' }}>
          <Box sx={{ mb: 3, display: 'inline-flex', p: 2.5, borderRadius: '50%', bgcolor: 'rgba(29, 29, 31, 0.05)' }}>
            <LockOutlinedIcon color="primary" sx={{ fontSize: 48 }} />
          </Box>

          <Typography variant="h4" fontWeight={700} gutterBottom>
            Account Required for Checkout
          </Typography>

          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 520, mx: 'auto', mb: 4, lineHeight: 1.6 }}>
            Please Login or Create an Account to continue to checkout. Your selected items will be saved automatically in your cart.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" sx={{ maxWidth: 440, mx: 'auto', mb: 5 }}>
            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={() => navigate('/login?redirect=/checkout')}
              startIcon={<LoginIcon />}
              sx={{
                py: 1.4,
                bgcolor: '#1d1d1f',
                color: '#fff',
                borderRadius: 980,
                fontWeight: 600,
                '&:hover': { bgcolor: '#000' },
              }}
            >
              Login
            </Button>

            <Button
              variant="outlined"
              size="large"
              fullWidth
              onClick={() => navigate('/register?redirect=/checkout')}
              startIcon={<PersonAddOutlinedIcon />}
              sx={{
                py: 1.4,
                borderRadius: 980,
                fontWeight: 600,
                borderColor: '#1d1d1f',
                color: '#1d1d1f',
                '&:hover': { borderColor: '#000', bgcolor: 'rgba(0,0,0,0.04)' },
              }}
            >
              Register / Create Account
            </Button>
          </Stack>

          {cartItems.length > 0 && (
            <Paper elevation={0} sx={{ p: 3, borderRadius: 3, bgcolor: '#f8fafc', border: '1px solid rgba(0,0,0,0.06)', textAlign: 'left' }}>
              <Typography variant="subtitle2" color="text.secondary" fontWeight={600} gutterBottom>
                YOUR GUEST CART ({cartItems.length} ITEM{cartItems.length !== 1 ? 'S' : ''})
              </Typography>
              <List dense disablePadding>
                {cartItems.map((item, i) => (
                  <ListItem key={item._id || item.id || i} disableGutters sx={{ py: 1 }}>
                    <ListItemAvatar>
                      <Avatar src={item.image} alt={item.name} variant="rounded" sx={{ width: 44, height: 44 }} />
                    </ListItemAvatar>
                    <ListItemText
                      primary={<Typography variant="body2" fontWeight={600}>{item.name}</Typography>}
                      secondary={`Qty: ${item.quantity || 1} • ₹${((item.price || 0) * 90).toFixed(2)}`}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}
        </Paper>
      </Container>
    );
  }


  // Existing card payment handler (unchanged)
  const handleSubmit = async formData => {
    if (!selectedItems.size) {
      notify({ severity: 'warning', message: 'Select at least one item before checking out.' });
      return;
    }

    const itemsToPurchase = cartItems.filter(item => {
      const id = item._id || item.id;
      return id && selectedItems.has(id);
    });

    if (!itemsToPurchase.length) {
      notify({ severity: 'warning', message: 'Selected items are unavailable. Please refresh your cart.' });
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const orderPayload = {
        ...formData,
        items: itemsToPurchase
          .map(item => ({
            productId: item._id || item.id,
            quantity: item.quantity || 1,
          }))
          .filter(item => item.productId),
      };

      if (!orderPayload.items.length) {
        setLoading(false);
        notify({ severity: 'error', message: 'Unable to place order: missing product information.' });
        return;
      }

      const { data } = await withRetry(() => apiClient.post('checkout/create-order', orderPayload));

      const normalizedEmail = formData.email?.trim() || '';

      setLoading(false);
      setOrderCreated(true);
      onOrderComplete?.();

      // If user checked "Save this address for future orders", save to account
      if (deliveryInfo?.saveAddressData && localStorage.getItem('MERNEcommerceToken')) {
        apiClient.post('address', deliveryInfo.saveAddressData).catch(err => {
          console.warn('Auto-save address error:', err);
        });
      }

      if (data?.orderNumber) {
        try {
          setUserItem('fusionLastOrder', { orderNumber: data.orderNumber, email: normalizedEmail });
        } catch (storageError) {
          console.warn('Unable to persist last order reference', storageError);
        }
      }

      notify({ severity: 'success', message: 'Order placed successfully! Redirecting…' });

      navigate('/order-success', {
        state: {
          orderNumber: data?.orderNumber,
          email: normalizedEmail,
          estimatedDelivery: data?.estimatedDelivery,
          items: data?.items,
          total: data?.total,
        },
      });
    } catch (error) {
      console.error('Error creating order:', error);
      setLoading(false);
      const message = error?.response?.data?.error || 'Something went wrong while placing your order.';
      setErrorMessage(message);
      notify({ severity: 'error', message });
    }
  };

  const itemsToShow = cartItems.filter(item => {
    const id = item._id || item.id;
    return id && selectedItems.has(id);
  });
  const total = itemsToShow.reduce((sum, item) => sum + (item.price || 0), 0);
  const allSelected = cartItems.every(item => selectedItems.has(item._id || item.id));

  const toggleItem = id => {
    if (!id) return;
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedItems(prev => {
      if (prev.size === cartItems.length) {
        return new Set();
      }
      return new Set(cartItems.map(item => item._id || item.id).filter(Boolean));
    });
  };

  // Payment method selector styles
  const getMethodStyles = (method) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    p: 2,
    borderRadius: 3,
    border: paymentMethod === method ? '2px solid' : '1px solid',
    borderColor: paymentMethod === method ? 'primary.main' : 'divider',
    background: paymentMethod === method ? 'rgba(0, 0, 0, 0.04)' : 'transparent',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
    textAlign: 'left',
    '&:hover': {
      borderColor: 'primary.main',
      background: 'rgba(0, 0, 0, 0.02)',
    },
  });

  return (
    <Container maxWidth="md" sx={{ pb: 10 }}>
      <Paper elevation={0} sx={{ p: { xs: 3, md: 5 }, borderRadius: 4 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
          <ShoppingCartCheckoutIcon color="primary" fontSize="large" />
          <Box>
            <Typography variant="h4" gutterBottom>
              Checkout
            </Typography>
            <Typography variant="body2" color="text.secondary">
              You have {itemsToShow.length} item{itemsToShow.length !== 1 ? 's' : ''} selected. Total due ₹{(total * 90).toFixed(2)}.
            </Typography>
          </Box>
        </Stack>

        <Divider sx={{ mb: 3 }} />

        {cartItems.length > 0 && (
          <Paper elevation={0} sx={{ mb: 4, borderRadius: 3, background: 'rgba(0,0,0,0.03)', p: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <ShoppingBagIcon color="primary" />
              <Typography variant="subtitle1" fontWeight={600}>
                Selected items ({itemsToShow.length}/{cartItems.length})
              </Typography>
              <Tooltip title={allSelected ? 'Deselect all items' : 'Select all items'}>
                <Checkbox
                  color="primary"
                  checked={allSelected}
                  indeterminate={selectedItems.size > 0 && !allSelected}
                  onChange={toggleAll}
                  sx={{ ml: 'auto' }}
                />
              </Tooltip>
              <IconButton size="small" onClick={() => setShowCartSummary(prev => !prev)}>
                <ExpandMoreIcon
                  sx={{
                    transform: showCartSummary ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s ease',
                  }}
                />
              </IconButton>
            </Stack>
            <Collapse in={showCartSummary} timeout="auto" unmountOnExit>
              <List dense>
                {cartItems.map(item => {
                  const id = item._id || item.id;
                  if (!id) return null;
                  const checked = selectedItems.has(id);
                  return (
                    <ListItem key={id} secondaryAction={<Checkbox edge="end" color="primary" checked={checked} onChange={() => toggleItem(id)} />}>
                      <ListItemAvatar>
                        <Avatar src={item.image} alt={item.name} variant="rounded" />
                      </ListItemAvatar>
                      <ListItemText primary={item.name} secondary={`₹${((item.price || 0) * 90).toFixed(2)}`} />
                    </ListItem>
                  );
                })}
                {selectedItems.size === 0 && (
                  <ListItem>
                    <ListItemText primary="No items selected. Choose at least one item to proceed." />
                  </ListItem>
                )}
              </List>
            </Collapse>
          </Paper>
        )}

        {orderCreated ? (
          <Typography variant="h5" gutterBottom>
            Thank you for your order! You will be redirected shortly.
          </Typography>
        ) : (
          <>
            {/* Payment Method Selector */}
            <Paper elevation={0} sx={{ mb: 4, borderRadius: 3, p: 3, background: 'rgba(0,0,0,0.02)' }}>
              <Typography variant="h6" gutterBottom fontWeight={600}>
                Choose Payment Method
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <ButtonBase
                  onClick={() => setPaymentMethod('card')}
                  sx={getMethodStyles('card')}
                  disableRipple
                >
                  <CreditCardIcon sx={{ fontSize: 32, color: paymentMethod === 'card' ? 'primary.main' : 'text.secondary' }} />
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600} color={paymentMethod === 'card' ? 'primary.main' : 'text.primary'}>
                      💳 Card
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Credit / Debit Card
                    </Typography>
                  </Box>
                </ButtonBase>

                <ButtonBase
                  onClick={() => setPaymentMethod('razorpay')}
                  sx={getMethodStyles('razorpay')}
                  disableRipple
                >
                  <AccountBalanceWalletIcon sx={{ fontSize: 32, color: paymentMethod === 'razorpay' ? 'primary.main' : 'text.secondary' }} />
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600} color={paymentMethod === 'razorpay' ? 'primary.main' : 'text.primary'}>
                      Razorpay / UPI
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      UPI, Cards, Net Banking, Wallets
                    </Typography>
                  </Box>
                </ButtonBase>
              </Stack>
            </Paper>

            <Divider sx={{ mb: 3 }} />

            {loading && <CircularProgress sx={{ mb: 3 }} />}
            {errorMessage && (
              <Typography color="error" sx={{ display: 'none' }}>
                {errorMessage}
              </Typography>
            )}

            {/* Delivery Address Section (Saved Addresses or New / Guest) */}
            <CheckoutAddressSection onChange={setDeliveryInfo} />

            {/* Render selected payment form */}
            {paymentMethod === 'card' ? (
              <CheckoutForm onSubmit={handleSubmit} submitting={loading} deliveryInfo={deliveryInfo} />
            ) : (
              <RazorpayCheckout
                cartItems={cartItems}
                selectedItems={selectedItems}
                onOrderComplete={onOrderComplete}
                navigate={navigate}
                deliveryInfo={deliveryInfo}
              />
            )}

            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2, color: 'text.secondary' }}>
              <LockIcon fontSize="small" />
              <Typography variant="caption">Payments processed securely. We never store your card details.</Typography>
            </Stack>
          </>
        )}
      </Paper>
    </Container>
  );
}

export default Checkout;
