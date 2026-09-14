const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Cart = require('../models/cart');
const Product = require('../models/product');

/**
 * @route   GET /api/cart
 * @desc    Get cart for authenticated user
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id }).lean();
    res.json(cart ? cart.items : []);
  } catch (err) {
    console.error('Error fetching cart:', err.message);
    res.status(500).json({ msg: 'Server error while fetching cart' });
  }
});

/**
 * @route   PUT /api/cart
 * @desc    Sync / replace entire cart for authenticated user
 * @access  Private
 */
router.put('/', auth, async (req, res) => {
  try {
    const rawItems = Array.isArray(req.body) ? req.body : req.body?.items;
    if (!Array.isArray(rawItems)) {
      return res.status(400).json({ msg: 'Items array is required' });
    }

    const itemInputs = rawItems.filter(item => item && (item._id || item.id || item.productId));
    const productIds = itemInputs
      .map(item => String(item._id || item.id || item.productId))
      .filter(id => id.match(/^[0-9a-fA-F]{24}$/));

    let dbProducts = [];
    if (productIds.length && mongoose.connection.readyState === 1) {
      try {
        dbProducts = await Product.find({ _id: { $in: productIds } }).lean();
      } catch (e) {
        dbProducts = [];
      }
    }

    const dbProductMap = new Map(dbProducts.map(p => [String(p._id), p]));

    const sanitizedItems = itemInputs.map(item => {
      const canonicalId = String(item._id || item.id || item.productId);
      const dbProd = dbProductMap.get(canonicalId);
      return {
        productId: canonicalId,
        id: canonicalId,
        name: dbProd ? dbProd.name : String(item.name || 'Product'),
        price: dbProd ? dbProd.price : (typeof item.price === 'number' ? item.price : 0),
        image: dbProd ? dbProd.image : (item.image || ''),
        category: dbProd ? dbProd.category : (item.category || ''),
        quantity: Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1,
      };
    });

    const cart = await Cart.findOneAndUpdate(
      { user: req.user.id },
      { items: sanitizedItems },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json(cart.items);
  } catch (err) {
    console.error('Error syncing cart:', err.message);
    res.status(500).json({ msg: 'Server error while syncing cart' });
  }
});

/**
 * @route   POST /api/cart/add
 * @desc    Add product to cart for authenticated user
 * @access  Private
 */
router.post('/add', auth, async (req, res) => {
  try {
    const productInput = req.body?.product || req.body;
    const canonicalId = productInput?._id || productInput?.id || productInput?.productId;

    if (!canonicalId) {
      return res.status(400).json({ msg: 'Product ID is required' });
    }

    let dbProd = null;
    if (mongoose.connection.readyState === 1 && String(canonicalId).match(/^[0-9a-fA-F]{24}$/)) {
      try {
        dbProd = await Product.findById(canonicalId).lean();
      } catch (e) {
        dbProd = null;
      }
    }

    let cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      cart = new Cart({ user: req.user.id, items: [] });
    }

    const existsIndex = cart.items.findIndex(
      item => String(item.productId) === String(canonicalId) || String(item.id) === String(canonicalId)
    );

    const addQty = Number.isInteger(productInput.quantity) && productInput.quantity > 0 ? productInput.quantity : 1;

    if (existsIndex > -1) {
      cart.items[existsIndex].quantity = (cart.items[existsIndex].quantity || 1) + addQty;
      if (dbProd) {
        cart.items[existsIndex].price = dbProd.price;
        cart.items[existsIndex].name = dbProd.name;
        cart.items[existsIndex].image = dbProd.image;
        cart.items[existsIndex].category = dbProd.category;
      }
    } else {
      cart.items.push({
        productId: canonicalId,
        id: String(canonicalId),
        name: dbProd ? dbProd.name : String(productInput.name || 'Product'),
        price: dbProd ? dbProd.price : (typeof productInput.price === 'number' ? productInput.price : 0),
        image: dbProd ? dbProd.image : (productInput.image || ''),
        category: dbProd ? dbProd.category : (productInput.category || ''),
        quantity: addQty,
      });
    }

    await cart.save();
    res.json(cart.items);
  } catch (err) {
    console.error('Error adding to cart:', err.message);
    res.status(500).json({ msg: 'Server error while adding to cart' });
  }
});

/**
 * @route   DELETE /api/cart/item/:productId
 * @desc    Remove product from cart for authenticated user
 * @access  Private
 */
router.delete('/item/:productId', auth, async (req, res) => {
  try {
    const { productId } = req.params;
    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return res.json([]);
    }

    cart.items = cart.items.filter(
      item => String(item.productId) !== String(productId) && String(item.id) !== String(productId)
    );

    await cart.save();
    res.json(cart.items);
  } catch (err) {
    console.error('Error removing item from cart:', err.message);
    res.status(500).json({ msg: 'Server error while removing from cart' });
  }
});

/**
 * @route   DELETE /api/cart
 * @desc    Clear entire cart for authenticated user
 * @access  Private
 */
router.delete('/', auth, async (req, res) => {
  try {
    const cart = await Cart.findOneAndUpdate(
      { user: req.user.id },
      { items: [] },
      { upsert: true, new: true }
    );
    res.json(cart.items);
  } catch (err) {
    console.error('Error clearing cart:', err.message);
    res.status(500).json({ msg: 'Server error while clearing cart' });
  }
});

module.exports = router;
