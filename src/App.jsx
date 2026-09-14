import * as React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Box, Container, CssBaseline } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import NavigationBar from './components/NavigationBar';
import Home from './pages/Home';
import Shop from './pages/Shop';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderSuccess from './pages/OrderSuccess';
import ProductDetails from './pages/ProductDetails';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import Account from './pages/Account';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import NotFoundPage from './pages/NotFoundPage';
import Footer from './components/Footer';
import About from './pages/About';
import Support from './pages/Support';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import ShippingReturns from './pages/ShippingReturns';
import OrderTracking from './pages/OrderTracking';
import ScrollToTop from './components/ScrollToTop';
import { apiClient, withRetry } from './services/apiClient';
import { useNotifier } from './context/NotificationProvider';
import { getCurrentUserId, getUserItem, setUserItem, removeUserItem, onAuthChange, getAuthToken } from './utils/userStorage';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1d1d1f',
      light: '#424245',
      dark: '#000000',
    },
    secondary: {
      main: '#86868b',
    },
    background: {
      default: '#ffffff',
      paper: '#ffffff',
    },
    text: {
      primary: '#1d1d1f',
      secondary: '#6e6e73',
    },
    divider: 'rgba(0,0,0,0.08)',
  },
  typography: {
    fontFamily: '"SF Pro Display", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", Roboto, sans-serif',
    h2: { fontWeight: 700, letterSpacing: '-0.025em' },
    h3: { fontWeight: 700, letterSpacing: '-0.02em' },
    h4: { fontWeight: 600, letterSpacing: '-0.015em' },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: {
      fontWeight: 500,
      textTransform: 'none',
      letterSpacing: '-0.01em',
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 980,
          textTransform: 'none',
          paddingInline: 24,
          fontSize: '0.92rem',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#ffffff',
        },
      },
    },
  },
});

function App() {
  const [products, setProducts] = React.useState([]);
  const [cart, setCart] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [currentUserId, setCurrentUserId] = React.useState(() => getCurrentUserId());
  const { notify } = useNotifier();

  // Listen to auth changes (login, logout, account switch across tabs/components)
  React.useEffect(() => {
    const unsubscribe = onAuthChange(() => {
      const newUserId = getCurrentUserId();
      setCurrentUserId(newUserId);
    });
    return unsubscribe;
  }, []);

  // Load user-specific cart whenever user changes or on initial mount
  React.useEffect(() => {
    let active = true;

    const loadUserCart = async () => {
      const userId = currentUserId;

      if (!userId) {
        // Guest user: load from guest storage only
        const guestCart = getUserItem('fusionCart', []);
        if (active) {
          setCart(Array.isArray(guestCart) ? guestCart : []);
        }
        return;
      }

      // 1. Load user-scoped cached cart immediately for instant UI
      const cachedCart = getUserItem('fusionCart', []);
      if (active && Array.isArray(cachedCart)) {
        setCart(cachedCart);
      }

      // 2. Fetch authoritative database cart for this authenticated user
      try {
        const { data } = await apiClient.get('cart');
        if (active && Array.isArray(data)) {
          setCart(data);
          setUserItem('fusionCart', data);
        }
      } catch (err) {
        // Fallback to cached cart
      }
    };

    loadUserCart();

    return () => {
      active = false;
    };
  }, [currentUserId]);

  // Persist cart to user-scoped storage whenever cart changes
  React.useEffect(() => {
    setUserItem('fusionCart', cart);
  }, [cart]);

  // Safe updater for cart that syncs with backend database when logged in
  const updateCart = React.useCallback(updater => {
    setCart(prevCart => {
      const nextCart = typeof updater === 'function' ? updater(prevCart) : updater;
      const sanitized = Array.isArray(nextCart) ? nextCart : [];
      if (getAuthToken()) {
        apiClient.put('cart', { items: sanitized }).catch(err => {
          console.warn('Unable to sync cart to server:', err?.message);
        });
      }
      return sanitized;
    });
  }, []);

  React.useEffect(() => {
    let active = true;

    const fetchProducts = async () => {
      setError(null);
      try {
        const { data } = await withRetry(() => apiClient.get('products'));
        if (!Array.isArray(data)) {
          throw new Error('Unexpected products response.');
        }
        const normalized = data.map(product => {
          const canonicalId = product?._id || product?.id;
          return {
            ...product,
            _id: canonicalId,
            id: canonicalId,
          };
        });
        if (active) {
          setProducts(normalized);

          let removedCount = 0;
          setCart(prevCart => {
            if (!Array.isArray(prevCart) || !prevCart.length) return prevCart;
            const validIds = new Set(normalized.map(item => String(item.id)));
            const sanitized = prevCart.filter(item => {
              const itemId = item?._id || item?.id;
              return itemId && validIds.has(String(itemId));
            });
            removedCount = prevCart.length - sanitized.length;
            return sanitized;
          });

          if (removedCount > 0) {
            notify({ severity: 'info', message: 'We refreshed your cart to remove items that are no longer available.' });
          }
        }
      } catch (err) {
        if (!active) return;
        console.error('Error fetching products:', err);
        setProducts([]);
        setError(err);
        notify({ severity: 'error', message: 'Unable to load products. Please try again shortly.' });
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchProducts();

    return () => {
      active = false;
    };
  }, [notify]);

  const addToCart = React.useCallback(
    async product => {
      if (!product) return;
      const canonicalId = product._id || product.id;
      if (!canonicalId) {
        notify({ severity: 'error', message: 'Unable to add this product right now.' });
        return;
      }

      let shouldAdd = false;
      setCart(prevCart => {
        const alreadyInCart = prevCart.some(item => item.id === canonicalId || item._id === canonicalId);
        if (alreadyInCart) {
          notify({ severity: 'info', message: 'Item is already in your cart.' });
          return prevCart;
        }
        shouldAdd = true;
        notify({ severity: 'success', message: 'Added to cart!' });
        const normalized = { ...product, id: canonicalId, _id: canonicalId };
        return [...prevCart, normalized];
      });

      if (shouldAdd && getAuthToken()) {
        try {
          await apiClient.post('cart/add', {
            _id: canonicalId,
            id: canonicalId,
            name: product.name,
            price: product.price,
            image: product.image,
            category: product.category,
            quantity: 1,
          });
        } catch (err) {
          console.warn('Unable to sync added cart item to server:', err?.message);
        }
      }
    },
    [notify]
  );

  const handleOrderComplete = React.useCallback(async () => {
    setCart([]);
    removeUserItem('fusionCart');
    if (getAuthToken()) {
      try {
        await apiClient.delete('cart');
      } catch (err) {
        console.warn('Unable to clear server cart after order:', err?.message);
      }
    }
    notify({ severity: 'success', message: 'Thank you for your order!' });
  }, [notify]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <ScrollToTop />
        <NavigationBar cartItemCount={cart.length} />
        <Box component="main" sx={{ minHeight: 'calc(100vh - 200px)' }}>
          <Container maxWidth="xl" sx={{ pb: 8 }}>
            <Routes>
              <Route path="/" element={<Home products={products} loading={loading} error={error} addToCart={addToCart} />} />

              <Route path="/shop" element={<Shop products={products} addToCart={addToCart} loading={loading} error={error} />} />

              <Route path="/about" element={<About />} />

              <Route path="/support" element={<Support />} />

              <Route path="/terms" element={<Terms />} />

              <Route path="/privacy" element={<Privacy />} />

              <Route path="/shipping-returns" element={<ShippingReturns />} />

              <Route path="/order-tracking" element={<OrderTracking />} />

              <Route path="/cart" element={<Cart cart={cart} setCart={updateCart} />} />

              <Route path="/checkout" element={<Checkout cartItems={cart} onOrderComplete={handleOrderComplete} />} />

              <Route path="/order-success" element={<OrderSuccess />} />

              <Route path="/product/:id" element={<ProductDetails addToCart={addToCart} />} />

              <Route path="/login" element={<Login />} />

              <Route path="/register" element={<Register />} />

              <Route path="/verify-email" element={<VerifyEmail />} />

              <Route path="/account" element={<Account />} />

              <Route path="/forgot-password" element={<ForgotPassword />} />

              <Route path="/reset-password" element={<ResetPassword />} />

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Container>
        </Box>
        <Footer />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
