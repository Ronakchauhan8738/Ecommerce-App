const express = require('express');
const crypto = require('crypto');
const { randomInt } = require('crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');
const Product = require('../models/product');
const Order = require('../models/order');
const Cart = require('../models/cart');

const router = express.Router();

const STATUS_FLOW = Order.STATUS_FLOW || [];
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Initialize Razorpay instance
const getRazorpayInstance = () => {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    throw new Error('Razorpay API keys are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your .env file.');
  }

  return new Razorpay({ key_id, key_secret });
};

async function generateOrderNumber() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = `FE-${randomInt(100000, 999999)}`;
    const exists = await Order.exists({ orderNumber: candidate });
    if (!exists) {
      return candidate;
    }
  }
  return `FE-${Date.now()}`;
}

/**
 * POST /api/razorpay/create-order
 * Creates a Razorpay order and a pending Order document in MongoDB.
 * Amount is calculated server-side from product prices in the database.
 */
router.post('/create-order', async (req, res) => {
  try {
    const { items, name, email, shippingAddress } = req.body;

    // Validate required fields (no card fields needed for Razorpay)
    if (!Array.isArray(items) || !items.length || !name || !email || !shippingAddress) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const trimmedEmail = String(email).trim();
    const trimmedName = String(name).trim();
    const trimmedAddress = String(shippingAddress).trim();

    if (!trimmedName || !trimmedAddress) {
      return res.status(400).json({ error: 'Name and shipping address are required.' });
    }

    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Normalize and validate items
    const normalizedItems = [];
    for (const item of items) {
      const productId = item?.productId || item?.id;
      const quantity = Number.isInteger(item?.quantity) && item.quantity > 0 ? item.quantity : 1;

      if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ error: 'Invalid product reference in order payload.' });
      }

      normalizedItems.push({ productId: String(productId), quantity });
    }

    // Fetch products from DB to get server-side prices
    const productIds = [...new Set(normalizedItems.map(item => item.productId))];
    const products = await Product.find({ _id: { $in: productIds } }).lean();

    if (products.length !== productIds.length) {
      return res.status(400).json({ error: 'One or more products are no longer available.' });
    }

    const productMap = new Map(products.map(product => [String(product._id), product]));

    const orderItems = normalizedItems.map(item => {
      const product = productMap.get(item.productId);
      return {
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        image: product.image,
      };
    });

    const orderTotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // Amount in paise (smallest currency unit for INR)
    const amountInPaise = Math.round(orderTotal * 90 * 100);

    // Create Razorpay order
    const razorpay = getRazorpayInstance();
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
    });

    // Create pending order in MongoDB
    const orderNumber = await generateOrderNumber();
    const estimatedDelivery = new Date(Date.now() + randomInt(2, 6) * 24 * 60 * 60 * 1000);

    let userId = null;
    const token = req.header('x-auth-token');
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.user?.id || null;
      } catch (e) {
        // optional auth
      }
    }

    const orderPayload = {
      orderNumber,
      email: trimmedEmail.toLowerCase(),
      name: trimmedName,
      shippingAddress: trimmedAddress,
      items: orderItems,
      total: orderTotal,
      estimatedDelivery,
      paymentMethod: 'razorpay',
      paymentStatus: 'pending',
      razorpayOrderId: razorpayOrder.id,
    };
    if (userId) {
      orderPayload.user = userId;
    }

    const order = new Order(orderPayload);

    order.ensureInitialStatus();
    await order.save();

    res.status(201).json({
      razorpayOrderId: razorpayOrder.id,
      orderId: order._id,
      orderNumber: order.orderNumber,
      amount: amountInPaise,
      currency: 'INR',
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({ error: error.message || 'Failed to create Razorpay order' });
  }
});

/**
 * POST /api/razorpay/verify-payment
 * Verifies the Razorpay payment signature and marks the order as paid.
 */
router.post('/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      return res.status(400).json({ error: 'Missing required payment verification fields' });
    }

    // Verify signature using HMAC SHA256
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'Payment verification configuration error' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      // Mark order as failed
      await Order.findByIdAndUpdate(orderId, { paymentStatus: 'failed' });
      return res.status(400).json({ error: 'Payment verification failed. Invalid signature.' });
    }

    // Update order as paid
    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        paymentStatus: 'paid',
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paidAt: new Date(),
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.user) {
      try {
        await Cart.findOneAndUpdate({ user: order.user }, { items: [] });
      } catch (cartErr) {
        console.warn('Unable to clear user cart after razorpay payment:', cartErr.message);
      }
    }

    res.status(200).json({
      message: 'Payment verified successfully!',
      orderNumber: order.orderNumber,
      estimatedDelivery: order.estimatedDelivery,
      statusHistory: order.statusHistory,
      statusFlow: STATUS_FLOW,
      items: order.items,
      total: order.total,
    });
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

module.exports = router;
