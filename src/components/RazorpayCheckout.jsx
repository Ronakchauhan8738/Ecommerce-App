import React, { useState } from 'react';
import { TextField, Button, Typography, Grid, CircularProgress, Box, Alert } from '@mui/material';
import { useNotifier } from '../context/NotificationProvider';
import { apiClient } from '../services/apiClient';
import { setUserItem } from '../utils/userStorage';

function RazorpayCheckout({ cartItems = [], selectedItems, onOrderComplete, navigate, deliveryInfo }) {
  const [formData, setFormData] = useState({
    name: deliveryInfo?.name || '',
    email: deliveryInfo?.email || '',
    shippingAddress: deliveryInfo?.shippingAddress || '',
  });

  React.useEffect(() => {
    if (deliveryInfo) {
      setFormData(prev => ({
        ...prev,
        name: deliveryInfo.name !== undefined ? deliveryInfo.name : prev.name,
        email: deliveryInfo.email !== undefined ? deliveryInfo.email : prev.email,
        shippingAddress: deliveryInfo.shippingAddress !== undefined ? deliveryInfo.shippingAddress : prev.shippingAddress,
      }));
    }
  }, [deliveryInfo]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { notify } = useNotifier();

  const handleInputChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    if (loading) return;

    // Basic validation
    if (!formData.name.trim() || !formData.email.trim() || !formData.shippingAddress.trim()) {
      notify({ severity: 'error', message: 'Please fill in all required fields.' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      notify({ severity: 'error', message: 'Please enter a valid email address.' });
      return;
    }

    const itemsToPurchase = cartItems.filter(item => {
      const id = item._id || item.id;
      return id && selectedItems.has(id);
    });

    if (!itemsToPurchase.length) {
      notify({ severity: 'warning', message: 'No items selected for checkout.' });
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      // Step 1: Create Razorpay order on backend
      const orderPayload = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        shippingAddress: formData.shippingAddress.trim(),
        items: itemsToPurchase.map(item => ({
          productId: item._id || item.id,
          quantity: item.quantity || 1,
        })).filter(item => item.productId),
      };

      const { data } = await apiClient.post('razorpay/create-order', orderPayload);

      const { razorpayOrderId, orderId, amount, currency, key_id } = data;

      // Step 2: Open Razorpay Checkout
      const options = {
        key: key_id,
        amount,
        currency,
        name: 'Fusion Electronics',
        description: `Order ${data.orderNumber}`,
        order_id: razorpayOrderId,
        prefill: {
          name: formData.name.trim(),
          email: formData.email.trim(),
        },
        theme: {
          color: '#1d1d1f',
        },
        handler: async function (response) {
          // Step 3: Verify payment on backend
          try {
            const verifyRes = await apiClient.post('razorpay/verify-payment', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              orderId,
            });

            const verifyData = verifyRes.data;

            setLoading(false);
            onOrderComplete?.();

            if (deliveryInfo?.saveAddressData && localStorage.getItem('MERNEcommerceToken')) {
              apiClient.post('address', deliveryInfo.saveAddressData).catch(err => {
                console.warn('Auto-save address error in Razorpay:', err);
              });
            }

            if (verifyData?.orderNumber) {
              try {
                setUserItem('fusionLastOrder', { orderNumber: verifyData.orderNumber, email: formData.email.trim() });
              } catch (storageError) {
                console.warn('Unable to persist last order reference', storageError);
              }
            }

            notify({ severity: 'success', message: 'Payment successful! Redirecting…' });

            navigate('/order-success', {
              state: {
                orderNumber: verifyData?.orderNumber,
                email: formData.email.trim(),
                estimatedDelivery: verifyData?.estimatedDelivery,
                items: verifyData?.items,
                total: verifyData?.total,
              },
            });
          } catch (verifyError) {
            setLoading(false);
            const msg = verifyError?.response?.data?.error || 'Payment verification failed. Please contact support.';
            setErrorMessage(msg);
            notify({ severity: 'error', message: msg });
          }
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
            notify({ severity: 'info', message: 'Payment was cancelled. You can try again.' });
          },
        },
      };

      const rzp = new window.Razorpay(options);

      rzp.on('payment.failed', function (response) {
        setLoading(false);
        const msg = response?.error?.description || 'Payment failed. Please try again.';
        setErrorMessage(msg);
        notify({ severity: 'error', message: msg });
      });

      rzp.open();
    } catch (error) {
      console.error('Error initiating Razorpay payment:', error);
      setLoading(false);
      const message = error?.response?.data?.error || 'Failed to initiate payment. Please try again.';
      setErrorMessage(message);
      notify({ severity: 'error', message });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {deliveryInfo && deliveryInfo.shippingAddress ? (
        <Box sx={{ mb: 3, p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
            Delivery & Contact Summary
          </Typography>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 0.5 }}>
            {formData.name} &bull; {formData.email}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {formData.shippingAddress}
          </Typography>
        </Box>
      ) : (
        <>
          <Typography variant="h4" gutterBottom>
            Billing Information
          </Typography>

          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                required
                id="rzp-name"
                name="name"
                label="Full Name"
                fullWidth
                variant="standard"
                value={formData.name}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                required
                id="rzp-email"
                name="email"
                label="Email Address"
                fullWidth
                variant="standard"
                value={formData.email}
                onChange={handleInputChange}
              />
            </Grid>
          </Grid>

          <Typography variant="h4" gutterBottom sx={{ mt: 4 }}>
            Shipping Information
          </Typography>

          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                required
                id="rzp-shippingAddress"
                name="shippingAddress"
                label="Shipping Address"
                fullWidth
                variant="standard"
                value={formData.shippingAddress}
                onChange={handleInputChange}
              />
            </Grid>
          </Grid>
        </>
      )}

      <Box sx={{ mt: 3, p: 2, borderRadius: 2, background: 'rgba(103, 58, 183, 0.06)', border: '1px solid rgba(103, 58, 183, 0.2)' }}>
        <Typography variant="body2" color="text.secondary">
          💡 You will be redirected to Razorpay's secure payment gateway where you can pay using UPI, Credit/Debit Card, Net Banking, or Wallets.
        </Typography>
      </Box>

      {errorMessage && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {errorMessage}
        </Alert>
      )}

      {loading && <CircularProgress sx={{ mt: 2 }} />}

      <Button
        type="submit"
        variant="contained"
        sx={{
          mt: 4,
          mb: 4,
          background: '#1d1d1f',
          color: '#ffffff',
          fontWeight: 600,
          '&:hover': { background: '#000000' },
        }}
        disabled={loading}
        fullWidth
        size="large"
      >
        {loading ? 'Processing…' : 'Pay with Razorpay'}
      </Button>
    </form>
  );
}

export default RazorpayCheckout;
