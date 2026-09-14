import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  Grid,
  Link,
  Paper,
  Rating,
  Stack,
  Typography,
} from '@mui/material';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { apiClient, withRetry } from '../services/apiClient';
import { useNotifier } from '../context/NotificationProvider';
import { getUserItem, setUserItem } from '../utils/userStorage';

function SimilarProductsError({ onRetry }) {
  const [showDetails, setShowDetails] = React.useState(false);

  return (
    <Alert
      severity="warning"
      variant="outlined"
      icon={<CloudOffIcon fontSize="inherit" />}
      sx={{
        borderRadius: 2,
        borderWidth: 2,
        alignItems: 'center',
        background: theme => `linear-gradient(180deg, ${theme.palette.background.paper} 0%, ${theme.palette.action.hover} 100%)`,
        '& .MuiAlert-message': { width: '100%' },
      }}
      action={
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<RefreshIcon />} onClick={onRetry}>
            Retry
          </Button>
          <Button size="small" component={Link} href="https://weaviate.io" target="_blank" rel="noopener" endIcon={<OpenInNewIcon />}>
            Docs
          </Button>
        </Stack>
      }
    >
      <AlertTitle>Similar products unavailable</AlertTitle>
      We couldn’t load recommendations right now. This often happens when the vector database is unreachable. Please try again shortly.
      <Box sx={{ mt: 1 }}>
        <Button
          size="small"
          endIcon={
            <ExpandMoreIcon
              sx={{
                transform: showDetails ? 'rotate(180deg)' : 'none',
                transition: '0.2s',
              }}
            />
          }
          onClick={() => setShowDetails(v => !v)}
        >
          {showDetails ? 'Hide details' : 'Show details'}
        </Button>
        <Collapse in={showDetails}>
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              mt: 1,
              bgcolor: theme => theme.palette.action.hover,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            Weaviate cluster has been suspended. Please create your own free cluster at https://weaviate.io/developers/weaviate/installation/cloud and update
            the API URL in <code>.env</code> to restore recommendations.
          </Paper>
        </Collapse>
      </Box>
    </Alert>
  );
}

function ProductDetails({ addToCart }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userRating, setUserRating] = useState(0);
  const [recommended, setRecommended] = useState([]);
  const [recLoading, setRecLoading] = useState(true);
  const [similarError, setSimilarError] = useState(false);
  const { notify } = useNotifier();

  const normalizeProduct = useCallback(prod => {
    if (!prod || typeof prod !== 'object') return null;
    const candidate = prod._id ?? prod.id ?? prod.mongoId ?? prod?.metadata?.mongoId;
    const normalizedId = candidate !== undefined && candidate !== null ? `${candidate}` : undefined;

    return normalizedId
      ? {
          ...prod,
          id: normalizedId,
          _id: normalizedId,
        }
      : { ...prod };
  }, []);

  const recordVisit = useCallback(
    prod => {
      try {
        const normalized = normalizeProduct(prod);
        if (!normalized?.id) return;

        const stored = getUserItem('visitedProducts', []);
        const validStored = Array.isArray(stored) ? stored : [];
        const filtered = validStored.filter(item => item.id !== normalized.id);
        const next = [
          ...filtered,
          {
            id: normalized.id,
            name: normalized.name,
            image: normalized.image,
            price: normalized.price,
            visitedAt: Date.now(),
          },
        ].slice(-12);
        setUserItem('visitedProducts', next);
      } catch (storageError) {
        console.warn('Unable to track visited product', storageError);
      }
    },
    [normalizeProduct]
  );

  const fetchRecommended = useCallback(async () => {
    setRecLoading(true);
    setSimilarError(false);
    try {
      const { data: recs } = await withRetry(() => apiClient.get(`products/${id}/similar`));
      if (!Array.isArray(recs)) {
        setRecommended([]);
        return;
      }
      const normalized = recs
        .map(item => normalizeProduct(item))
        .filter(Boolean)
        .filter((item, index, self) => item.id && self.findIndex(other => other.id === item.id) === index)
        .filter(item => item.id !== `${id}`);
      setRecommended(normalized);
    } catch (err) {
      console.error('Error fetching recommendations:', err);
      setSimilarError(true);
      setRecommended([]);
    } finally {
      setRecLoading(false);
    }
  }, [id, normalizeProduct]);

  const fetchProduct = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await withRetry(() => apiClient.get(`products/${id}`));
      const normalized = normalizeProduct(data);
      if (!normalized?.id) {
        throw new Error('Product not found');
      }
      setProduct(normalized);
      setUserRating(normalized.rating || 0);
      recordVisit(normalized);
      fetchRecommended();
    } catch (err) {
      console.error('Error fetching product details:', err);
      setProduct(null);
      setError(err);
      if (err?.response?.status === 404) {
        try {
          const stored = getUserItem('visitedProducts', []);
          if (Array.isArray(stored)) {
            const filtered = stored.filter(item => item?.id !== id);
            setUserItem('visitedProducts', filtered);
          }
        } catch (storageError) {
          console.warn('Unable to prune visitedProducts cache', storageError);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [fetchRecommended, id, normalizeProduct, recordVisit]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  const formatCategory = value => {
    if (typeof value !== 'string' || !value.length) {
      return 'Uncategorized';
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
  };

  const handleAddToCart = useCallback(() => {
    if (product) {
      addToCart(product);
    }
  }, [addToCart, product]);

  const handleRatingChange = async (_e, newRating) => {
    setUserRating(newRating);
    try {
      await apiClient.put(`products/${id}/rating`, { rating: newRating });
      setProduct(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          rating: newRating,
          numReviews: (prev.numReviews || 0) + 1,
        };
      });
      notify({ severity: 'success', message: 'Thanks for the feedback!' });
    } catch (err) {
      console.error('Error updating rating:', err);
      notify({ severity: 'error', message: 'Could not update your rating right now.' });
    }
  };

  if (loading) {
    return (
      <Container sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error || !product) {
    return (
      <Container maxWidth="sm" sx={{ py: 10 }}>
        <Paper elevation={0} sx={{ p: { xs: 3, md: 5 }, textAlign: 'center', borderRadius: 4 }}>
          <Typography variant="h4" gutterBottom>
            We could not load this product.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            The product may have been removed or is temporarily unavailable. Please refresh or browse the latest releases.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
            <Button variant="contained" onClick={fetchProduct} startIcon={<RefreshIcon />}>
              Try again
            </Button>
            <Button variant="outlined" onClick={() => navigate('/shop')}>
              Back to shop
            </Button>
          </Stack>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, pb: 8 }}>
      <Paper elevation={0} sx={{ p: { xs: 3, md: 5 }, borderRadius: 4, border: '1px solid rgba(0,0,0,0.08)', bgcolor: '#fff' }}>
        <Grid container spacing={5} alignItems="center">
          <Grid item xs={12} md={6}>
            <Box sx={{ bgcolor: '#fafafa', borderRadius: 4, p: { xs: 3, md: 5 }, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <img src={product.image} alt={product.name} style={{ width: '100%', maxHeight: '420px', objectFit: 'contain' }} />
            </Box>
          </Grid>

          <Grid item xs={12} md={6}>
            <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1.5, fontWeight: 600 }}>
              {product.brand || 'Fusion Electronics'} • {formatCategory(product.category)}
            </Typography>
            <Typography variant="h3" fontWeight={700} sx={{ fontSize: { xs: '1.8rem', md: '2.4rem' }, letterSpacing: '-0.02em', mt: 0.5, mb: 2 }}>
              {product.name}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#1d1d1f', mb: 2 }}>
              ₹{(product.price * 90).toFixed(2)}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7, mb: 3 }}>
              {product.description}
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, my: 2 }}>
              <Chip
                label={product.stock > 0 ? `${product.stock} In Stock` : 'Out of Stock'}
                size="small"
                variant="outlined"
                color={product.stock > 0 ? 'default' : 'error'}
                sx={{ fontWeight: 600 }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Rating value={userRating} precision={0.5} onChange={handleRatingChange} size="small" sx={{ mr: 1 }} />
                <Typography variant="caption" color="text.secondary">
                  ({product.numReviews || 0} reviews)
                </Typography>
              </Box>
            </Box>

            <Button
              variant="contained"
              size="large"
              onClick={handleAddToCart}
              sx={{
                mt: 3,
                px: 5,
                py: 1.4,
                bgcolor: '#1d1d1f',
                color: '#fff',
                borderRadius: 980,
                fontWeight: 600,
                boxShadow: 'none',
                '&:hover': { bgcolor: '#000', boxShadow: '0 4px 14px rgba(0,0,0,0.15)' },
              }}
            >
              Add to Cart
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Box sx={{ mt: 5 }}>
        <Typography variant="h5" gutterBottom>
          Recommended for you
        </Typography>

        {recLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
            <CircularProgress size={32} />
          </Box>
        ) : recommended.length === 0 ? (
          similarError ? (
            <SimilarProductsError onRetry={fetchRecommended} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              We are curating recommendations for this product. Check back soon for more gear.
            </Typography>
          )
        ) : (
          <Grid container spacing={3}>
            {recommended.map(rec => (
              <Grid item xs={12} sm={6} md={4} key={rec.id}>
                <Card
                  elevation={0}
                  sx={{
                    height: '100%',
                    borderRadius: 4,
                    border: '1px solid rgba(0,0,0,0.06)',
                    background: '#ffffff',
                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 12px 24px rgba(0,0,0,0.06)',
                      borderColor: 'rgba(0,0,0,0.12)',
                    },
                  }}
                >
                  <CardActionArea onClick={() => navigate(`/product/${rec.id}`)}>
                    <Box sx={{ bgcolor: '#fafafa', p: 3, display: 'flex', justifyContent: 'center' }}>
                      <CardMedia component="img" height="150" image={rec.image} alt={rec.name} sx={{ objectFit: 'contain' }} />
                    </Box>
                    <CardContent sx={{ p: 2.5 }}>
                      <Typography variant="subtitle1" fontWeight={600} gutterBottom noWrap>
                        {rec.name}
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, color: '#1d1d1f' }}>
                        ₹{(rec.price * 90).toFixed(2)}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </Container>
  );
}

export default ProductDetails;
