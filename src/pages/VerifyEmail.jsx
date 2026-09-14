import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Button,
  Stack,
  Box,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import BoltIcon from '@mui/icons-material/Bolt';
import { apiClient } from '../services/apiClient';
import { useNotifier } from '../context/NotificationProvider';

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const email = searchParams.get('email') || '';
  const navigate = useNavigate();
  const { notify } = useNotifier();

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [devOtp, setDevOtp] = useState(location.state?.devOtp || '');
  const [, setEmailSent] = useState(location.state?.emailSent);
  const inputRefs = useRef([]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Auto-focus first input
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setError('');

    // Auto-advance
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = e => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      inputRefs.current[5]?.focus();
    }
  };

  const handleAutoFill = code => {
    if (!code) return;
    const digits = code.toString().slice(0, 6).split('');
    setOtp(digits);
    setError('');
    notify({ severity: 'info', message: 'Code auto-filled!' });
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length !== 6) {
      setError('Please enter the complete 6-digit code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('MERNEcommerceToken');
      const headers = token ? { 'x-auth-token': token } : {};
      const { data } = await apiClient.post('auth/verify-otp', { email, otp: code }, { headers });
      setSuccess(true);
      notify({ severity: 'success', message: data.msg || 'Email verified!' });
      const redirectTarget = searchParams.get('redirect') || '/account';
      setTimeout(() => navigate(redirectTarget, { replace: true }), 1200);
    } catch (err) {
      const msg = err.response?.data?.msg || 'Verification failed. Please try again.';
      setError(msg);
      notify({ severity: 'error', message: msg });
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError('');

    try {
      const { data } = await apiClient.post('auth/resend-otp', { email });
      if (data.devOtp) {
        setDevOtp(data.devOtp);
      }
      setEmailSent(data.emailSent);
      notify({
        severity: data.emailSent ? 'success' : 'info',
        message: data.msg || 'OTP resent!',
      });
      setCooldown(60);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err) {
      const msg = err.response?.data?.msg || 'Failed to resend OTP.';
      setError(msg);
      notify({ severity: 'error', message: msg });
    } finally {
      setResending(false);
    }
  };

  if (!email) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Paper elevation={3} sx={{ p: 5, borderRadius: 3, textAlign: 'center' }}>
          <Typography variant="h5" gutterBottom>
            No email specified
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Please register or log in to verify your email.
          </Typography>
          <Button variant="contained" onClick={() => navigate('/register')}>
            Register
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 8, mb: 10 }}>
      <Paper elevation={0} sx={{ p: { xs: 4, md: 5 }, borderRadius: 4, textAlign: 'center', border: '1px solid rgba(0,0,0,0.08)' }}>
        <MarkEmailReadIcon sx={{ fontSize: 56, color: success ? 'success.main' : 'primary.main', mb: 2 }} />

        <Typography variant="h4" fontWeight={700} gutterBottom>
          {success ? 'Email Verified!' : 'Verify Your Email'}
        </Typography>

        {!success && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              Verification code for:
            </Typography>
            <Typography variant="body1" fontWeight={700} sx={{ mb: 3, color: 'text.primary' }}>
              {email}
            </Typography>

            {/* Dev Fallback Notice if SMTP is not configured */}
            {devOtp && (
              <Alert
                severity="info"
                sx={{ mb: 3, textAlign: 'left', borderRadius: 2 }}
                action={
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    startIcon={<BoltIcon />}
                    onClick={() => handleAutoFill(devOtp)}
                    sx={{ textTransform: 'none' }}
                  >
                    Auto-Fill
                  </Button>
                }
              >
                <Typography variant="caption" display="block" fontWeight={700} color="primary.dark">
                  ⚡ Development Mode OTP:
                </Typography>
                <Typography
                  variant="h5"
                  fontWeight={800}
                  sx={{ letterSpacing: 4, my: 0.25, fontFamily: 'monospace', color: 'primary.main' }}
                >
                  {devOtp}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  SMTP is not configured in backend/.env. Use this code to verify.
                </Typography>
              </Alert>
            )}

            <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 3 }}>
              {otp.map((digit, i) => (
                <Box
                  key={i}
                  component="input"
                  ref={el => {
                    inputRefs.current[i] = el;
                  }}
                  value={digit}
                  onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  onPaste={handlePaste}
                  maxLength={1}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  sx={{
                    width: { xs: 40, sm: 52 },
                    height: { xs: 48, sm: 60 },
                    fontSize: { xs: '1.25rem', sm: '1.75rem' },
                    fontWeight: 700,
                    textAlign: 'center',
                    borderRadius: 2,
                    border: '2px solid',
                    borderColor: error ? 'error.main' : digit ? 'primary.main' : 'divider',
                    bgcolor: digit ? 'rgba(40, 116, 240, 0.04)' : 'background.paper',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    '&:focus': {
                      borderColor: 'primary.main',
                      boxShadow: '0 0 0 3px rgba(40, 116, 240, 0.2)',
                    },
                  }}
                />
              ))}
            </Stack>

            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={handleVerify}
              disabled={loading || otp.join('').length !== 6}
              sx={{
                py: 1.4,
                mb: 2,
                fontSize: '1rem',
                fontWeight: 600,
                bgcolor: '#1d1d1f',
                color: '#fff',
                borderRadius: 980,
                boxShadow: 'none',
                '&:hover': { bgcolor: '#000', boxShadow: '0 4px 14px rgba(0,0,0,0.15)' },
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Verify & Continue'}
            </Button>

            <Stack direction="row" justifyContent="center" alignItems="center" spacing={1} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Didn't receive the code?
              </Typography>
              <Button
                variant="text"
                size="small"
                onClick={handleResend}
                disabled={cooldown > 0 || resending}
                sx={{ fontWeight: 600 }}
              >
                {resending ? (
                  <CircularProgress size={16} />
                ) : cooldown > 0 ? (
                  `Resend in ${cooldown}s`
                ) : (
                  'Resend Code'
                )}
              </Button>
            </Stack>

            <Divider sx={{ my: 3 }} />

            <Typography variant="caption" color="text.secondary" display="block">
              ℹ️ To receive real verification emails in your Gmail inbox, add your Gmail address and a 16-character Google App Password in <code>backend/.env</code>.
            </Typography>
          </>
        )}

        {success && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Your email has been successfully verified. Redirecting to your account dashboard…
          </Alert>
        )}
      </Paper>
    </Container>
  );
}

export default VerifyEmail;
