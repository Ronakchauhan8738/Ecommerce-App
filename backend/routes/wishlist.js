const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Wishlist = require('../models/wishlist');
const Product = require('../models/product');

/**
 * @route   GET /api/wishlist
 * @desc    Get wishlist for authenticated user
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user.id })
      .populate('products')
      .lean();
    res.json(wishlist?.products || []);
  } catch (err) {
    console.error('Error fetching wishlist:', err.message);
    res.status(500).json({ msg: 'Server error while fetching wishlist' });
  }
});

/**
 * @route   POST /api/wishlist/toggle
 * @desc    Toggle product in wishlist for authenticated user
 * @access  Private
 */
router.post('/toggle', auth, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ msg: 'Product ID is required' });
    }

    let wishlist = await Wishlist.findOne({ user: req.user.id });
    if (!wishlist) {
      wishlist = new Wishlist({ user: req.user.id, products: [] });
    }

    const index = wishlist.products.findIndex(id => String(id) === String(productId));
    let added = false;
    if (index > -1) {
      wishlist.products.splice(index, 1);
    } else {
      wishlist.products.push(productId);
      added = true;
    }

    await wishlist.save();
    const populated = await Wishlist.findById(wishlist._id).populate('products').lean();
    res.json({ added, products: populated?.products || [] });
  } catch (err) {
    console.error('Error toggling wishlist:', err.message);
    res.status(500).json({ msg: 'Server error while updating wishlist' });
  }
});

/**
 * @route   POST /api/wishlist/add
 * @desc    Add product to wishlist for authenticated user
 * @access  Private
 */
router.post('/add', auth, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ msg: 'Product ID is required' });
    }

    let wishlist = await Wishlist.findOne({ user: req.user.id });
    if (!wishlist) {
      wishlist = new Wishlist({ user: req.user.id, products: [] });
    }

    if (!wishlist.products.some(id => String(id) === String(productId))) {
      wishlist.products.push(productId);
      await wishlist.save();
    }

    const populated = await Wishlist.findById(wishlist._id).populate('products').lean();
    res.json(populated?.products || []);
  } catch (err) {
    console.error('Error adding to wishlist:', err.message);
    res.status(500).json({ msg: 'Server error while adding to wishlist' });
  }
});

/**
 * @route   DELETE /api/wishlist/item/:productId
 * @desc    Remove product from wishlist for authenticated user
 * @access  Private
 */
router.delete('/item/:productId', auth, async (req, res) => {
  try {
    const { productId } = req.params;
    const wishlist = await Wishlist.findOne({ user: req.user.id });

    if (!wishlist) {
      return res.json([]);
    }

    wishlist.products = wishlist.products.filter(id => String(id) !== String(productId));
    await wishlist.save();

    const populated = await Wishlist.findById(wishlist._id).populate('products').lean();
    res.json(populated?.products || []);
  } catch (err) {
    console.error('Error removing from wishlist:', err.message);
    res.status(500).json({ msg: 'Server error while removing from wishlist' });
  }
});

module.exports = router;
