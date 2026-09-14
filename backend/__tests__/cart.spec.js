const express = require('express');
const bodyParser = require('body-parser');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../middleware/auth', () => (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ msg: 'No token' });
  if (token === 'token-user-a') {
    req.user = { id: 'user_a_id' };
    return next();
  }
  if (token === 'token-user-b') {
    req.user = { id: 'user_b_id' };
    return next();
  }
  return res.status(401).json({ msg: 'Invalid token' });
});

// Mock Cart model in-memory
const mockCarts = new Map();

jest.mock('../models/cart', () => {
  function CartMock(data) {
    this.user = data.user;
    this.items = data.items || [];
    this.save = jest.fn().mockImplementation(async () => {
      mockCarts.set(String(this.user), this);
      return this;
    });
  }

  CartMock.findOne = jest.fn().mockImplementation(({ user }) => {
    const existing = mockCarts.get(String(user));
    if (!existing) {
      return {
        lean: () => Promise.resolve(null),
        then: resolve => resolve(null),
      };
    }
    return {
      ...existing,
      lean: () => Promise.resolve({ user: existing.user, items: [...existing.items] }),
      then: resolve => resolve(existing),
    };
  });

  CartMock.findOneAndUpdate = jest.fn().mockImplementation(({ user }, update, opts) => {
    let existing = mockCarts.get(String(user));
    if (!existing) {
      existing = new CartMock({ user, items: [] });
    }
    if (update.items !== undefined) {
      existing.items = update.items;
    }
    mockCarts.set(String(user), existing);
    return {
      ...existing,
      then: resolve => resolve(existing),
    };
  });

  return CartMock;
});

const cartRouter = require('../routes/cart');

describe('Cart API - User Isolation', () => {
  let app;

  beforeEach(() => {
    mockCarts.clear();
    app = express();
    app.use(bodyParser.json());
    app.use('/api/cart', cartRouter);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/cart');
    expect(res.status).toBe(401);
  });

  it('User A and User B maintain completely isolated carts', async () => {
    // 1. User A adds an item to cart
    const addResA = await request(app)
      .post('/api/cart/add')
      .set('x-auth-token', 'token-user-a')
      .send({ id: 'prod-1', name: 'Product 1', price: 100 });
    expect(addResA.status).toBe(200);
    expect(addResA.body.length).toBe(1);
    expect(addResA.body[0].id).toBe('prod-1');

    // 2. User B fetches their cart - must be empty!
    const getResB = await request(app)
      .get('/api/cart')
      .set('x-auth-token', 'token-user-b');
    expect(getResB.status).toBe(200);
    expect(getResB.body).toEqual([]);

    // 3. User B adds a different product
    const addResB = await request(app)
      .post('/api/cart/add')
      .set('x-auth-token', 'token-user-b')
      .send({ id: 'prod-2', name: 'Product 2', price: 200 });
    expect(addResB.status).toBe(200);
    expect(addResB.body.length).toBe(1);
    expect(addResB.body[0].id).toBe('prod-2');

    // 4. User A fetches their cart again - must still only contain prod-1
    const getResA = await request(app)
      .get('/api/cart')
      .set('x-auth-token', 'token-user-a');
    expect(getResA.status).toBe(200);
    expect(getResA.body.length).toBe(1);
    expect(getResA.body[0].id).toBe('prod-1');

    // 5. User A removes prod-1 - User A cart is empty, User B cart is unchanged
    const removeResA = await request(app)
      .delete('/api/cart/item/prod-1')
      .set('x-auth-token', 'token-user-a');
    expect(removeResA.status).toBe(200);
    expect(removeResA.body).toEqual([]);

    const verifyB = await request(app)
      .get('/api/cart')
      .set('x-auth-token', 'token-user-b');
    expect(verifyB.status).toBe(200);
    expect(verifyB.body.length).toBe(1);
    expect(verifyB.body[0].id).toBe('prod-2');
  });

  it('syncs entire cart correctly for the authenticated user', async () => {
    const items = [
      { id: 'item-10', name: 'Keyboard', price: 1500, quantity: 2 },
      { id: 'item-20', name: 'Mouse', price: 500, quantity: 1 },
    ];

    const putRes = await request(app)
      .put('/api/cart')
      .set('x-auth-token', 'token-user-a')
      .send({ items });
    expect(putRes.status).toBe(200);
    expect(putRes.body.length).toBe(2);

    const getRes = await request(app)
      .get('/api/cart')
      .set('x-auth-token', 'token-user-a');
    expect(getRes.status).toBe(200);
    expect(getRes.body.length).toBe(2);
  });
});
