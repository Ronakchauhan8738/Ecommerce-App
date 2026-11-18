import * as React from 'react';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Rating from '@mui/material/Rating';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded';
import { useNavigate } from 'react-router-dom';

export default function ProductCard({ product, addToCart }) {
  const navigate = useNavigate();

  const canonicalId = product?._id || product?.id;
  const formattedCategory = product?.category ? product.category.charAt(0).toUpperCase() + product.category.slice(1) : null;
  const ratingValue = typeof product?.rating === 'number' ? product.rating : null;
  const reviewCount = typeof product?.numReviews === 'number' ? product.numReviews : null;

  const handleViewDetails = () => {
    if (!canonicalId) {
      return;
    }
    navigate(`/product/${canonicalId}`);
  };

  const handleCardClick = event => {
    if (!canonicalId) return;
    const button = event.target.closest('button');
    if (button) return;
    handleViewDetails();
  };

  return (
    <Card
      sx={{
        height: '100%',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: 'none',
        transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1), box-shadow 0.35s ease',
        '&:hover': {
          transform: 'translateY(-6px)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.10)',
        },
        '&:hover .product-media': {
          transform: 'scale(1.04)',
        },
      }}
      onClick={handleCardClick}
    >
      <Box
        sx={{
          position: 'relative',
          pt: '75%',
          overflow: 'hidden',
          borderRadius: '16px 16px 0 0',
          background: '#fafafa',
        }}
      >
        <CardMedia
          component="img"
          className="product-media"
          alt={product.name}
          src={product.image}
          loading="eager"
          onError={e => {
            e.target.onerror = null;
            e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="100%" height="100%" fill="%23f5f5f7"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2386868b" font-family="sans-serif" font-size="16">Product Image</text></svg>';
          }}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            p: 2,
            transition: 'transform 0.45s cubic-bezier(0.22,1,0.36,1)',
          }}
        />
        {formattedCategory && (
          <Chip
            size="small"
            label={formattedCategory}
            sx={{
              position: 'absolute',
              top: 16,
              left: 16,
              bgcolor: 'rgba(0,0,0,0.75)',
              color: '#fff',
              fontWeight: 500,
              fontSize: '0.7rem',
              backdropFilter: 'blur(8px)',
            }}
          />
        )}
      </Box>

      <Divider sx={{ borderColor: 'rgba(0,0,0,0.05)' }} />

      <CardContent sx={{ px: 2.5, pt: 2.5 }}>
        <Typography gutterBottom variant="h6" component="div" sx={{ fontWeight: 600, fontSize: '1.05rem', lineHeight: 1.3 }}>
          {product.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap sx={{ fontSize: '0.82rem' }}>
          {product.description}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#1d1d1f' }}>
            ₹{(product.price * 90).toFixed(2)}
          </Typography>
          {ratingValue !== null && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Rating name={`rating-${canonicalId}`} value={ratingValue} precision={0.5} readOnly size="small" />
              {reviewCount !== null && (
                <Typography variant="caption" color="text.secondary">
                  ({reviewCount})
                </Typography>
              )}
            </Stack>
          )}
        </Stack>
        {typeof product?.stock === 'number' && (
          <Typography variant="caption" color={product.stock > 5 ? 'success.main' : 'warning.main'} sx={{ mt: 1, display: 'block' }}>
            {product.stock > 5 ? `${product.stock} in stock` : 'Limited stock available'}
          </Typography>
        )}
      </CardContent>

      <CardActions disableSpacing sx={{ justifyContent: 'space-between', px: 2.5, pb: 2.5, mt: 'auto' }}>
        <Button
          size="small"
          variant="contained"
          startIcon={<AddShoppingCartRoundedIcon />}
          onClick={event => {
            event.stopPropagation();
            addToCart(product);
          }}
          sx={{
            bgcolor: '#1d1d1f',
            color: '#fff',
            boxShadow: 'none',
            '&:hover': { bgcolor: '#000', boxShadow: '0 4px 14px rgba(0,0,0,0.2)' },
          }}
        >
          Add to Cart
        </Button>
        <Tooltip title="See full specs" arrow>
          <Button
            size="small"
            color="inherit"
            onClick={event => {
              event.stopPropagation();
              handleViewDetails();
            }}
            sx={{ color: '#6e6e73', '&:hover': { color: '#1d1d1f' } }}
          >
            View Details
          </Button>
        </Tooltip>
      </CardActions>
    </Card>
  );
}
