import {
  clearUserSessionData,
  getCurrentUserId,
  getUserItem,
  setUserItem,
  notifyAuthChange,
  onAuthChange,
  getUserScopedKey,
} from '../utils/userStorage';
import { apiClient } from '../services/apiClient';

jest.mock('../services/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
  withRetry: jest.fn(fn => fn()),
}));

describe('Multi-Account Cart & Product Data Isolation', () => {
  const createToken = userId => {
    const payload = {
      user: { id: userId },
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    return `header.${btoa(JSON.stringify(payload))}.sig`;
  };

  const userAToken = createToken('user_account_A');
  const userBToken = createToken('user_account_B');

  // Simulated backend database storing user carts
  const serverCartDb = new Map();

  beforeEach(() => {
    localStorage.clear();
    serverCartDb.clear();

    apiClient.get.mockImplementation(url => {
      if (url === 'cart') {
        const userId = getCurrentUserId();
        return Promise.resolve({ data: serverCartDb.get(userId) || [] });
      }
      return Promise.resolve({ data: [] });
    });

    apiClient.put.mockImplementation((url, body) => {
      if (url === 'cart') {
        const userId = getCurrentUserId();
        serverCartDb.set(userId, body.items || []);
        return Promise.resolve({ data: body.items || [] });
      }
      return Promise.resolve({ data: [] });
    });

    apiClient.post.mockImplementation((url, body) => {
      if (url === 'cart/add') {
        const userId = getCurrentUserId();
        const current = serverCartDb.get(userId) || [];
        const updated = [...current, body];
        serverCartDb.set(userId, updated);
        return Promise.resolve({ data: updated });
      }
      return Promise.resolve({ data: {} });
    });

    apiClient.delete.mockImplementation(url => {
      if (url === 'cart') {
        const userId = getCurrentUserId();
        serverCartDb.set(userId, []);
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('verifies that keys in storage are strictly partitioned per user ID', () => {
    // Guest
    expect(getUserScopedKey('fusionCart')).toBe('fusionCart_guest');
    expect(getUserScopedKey('visitedProducts')).toBe('visitedProducts_guest');
    expect(getUserScopedKey('fusionLastOrder')).toBe('fusionLastOrder_guest');

    // User A
    localStorage.setItem('MERNEcommerceToken', userAToken);
    expect(getCurrentUserId()).toBe('user_account_A');
    expect(getUserScopedKey('fusionCart')).toBe('fusionCart_user_account_A');
    expect(getUserScopedKey('visitedProducts')).toBe('visitedProducts_user_account_A');
    expect(getUserScopedKey('fusionLastOrder')).toBe('fusionLastOrder_user_account_A');

    // User B
    localStorage.setItem('MERNEcommerceToken', userBToken);
    expect(getCurrentUserId()).toBe('user_account_B');
    expect(getUserScopedKey('fusionCart')).toBe('fusionCart_user_account_B');
    expect(getUserScopedKey('visitedProducts')).toBe('visitedProducts_user_account_B');
    expect(getUserScopedKey('fusionLastOrder')).toBe('fusionLastOrder_user_account_B');
  });

  it('guarantees complete isolation of cart, visited products, and last order between accounts', async () => {
    // -------------------------------------------------------------
    // 1. Account A logs in
    // -------------------------------------------------------------
    localStorage.setItem('MERNEcommerceToken', userAToken);
    notifyAuthChange('login');

    const itemAlpha = { id: 'p1', name: 'Product Alpha', price: 50 };
    const itemBeta = { id: 'p2', name: 'Product Beta', price: 100 };

    // Account A adds items to cart
    await apiClient.post('cart/add', itemAlpha);
    await apiClient.post('cart/add', itemBeta);
    setUserItem('fusionCart', [itemAlpha, itemBeta]);
    setUserItem('visitedProducts', [itemAlpha]);
    setUserItem('fusionLastOrder', { orderNumber: 'FE-111111', email: 'a@example.com' });

    // Verify Account A has 2 items
    expect(serverCartDb.get('user_account_A').length).toBe(2);
    expect(getUserItem('fusionCart').length).toBe(2);
    expect(getUserItem('visitedProducts').length).toBe(1);
    expect(getUserItem('fusionLastOrder').orderNumber).toBe('FE-111111');

    // -------------------------------------------------------------
    // 2. Account A logs out
    // -------------------------------------------------------------
    clearUserSessionData('user_account_A');
    localStorage.removeItem('MERNEcommerceToken');
    notifyAuthChange('logout');

    // -------------------------------------------------------------
    // 3. Account B logs in
    // -------------------------------------------------------------
    localStorage.setItem('MERNEcommerceToken', userBToken);
    notifyAuthChange('login');

    // Verify Account B starts with clean, isolated state
    const userBCartRes = await apiClient.get('cart');
    expect(userBCartRes.data).toEqual([]);
    expect(getUserItem('fusionCart', [])).toEqual([]);
    expect(getUserItem('visitedProducts', [])).toEqual([]);
    expect(getUserItem('fusionLastOrder')).toBeNull();

    // Account B adds Product Gamma
    const itemGamma = { id: 'p3', name: 'Product Gamma', price: 150 };
    await apiClient.post('cart/add', itemGamma);
    setUserItem('fusionCart', [itemGamma]);
    setUserItem('visitedProducts', [itemGamma]);
    setUserItem('fusionLastOrder', { orderNumber: 'FE-222222', email: 'b@example.com' });

    expect(serverCartDb.get('user_account_B').length).toBe(1);
    expect(getUserItem('fusionCart')[0].name).toBe('Product Gamma');
    expect(getUserItem('visitedProducts')[0].name).toBe('Product Gamma');
    expect(getUserItem('fusionLastOrder').orderNumber).toBe('FE-222222');

    // Verify Account A's server database cart was NOT modified by Account B
    expect(serverCartDb.get('user_account_A').length).toBe(2);

    // -------------------------------------------------------------
    // 4. Account B logs out
    // -------------------------------------------------------------
    clearUserSessionData('user_account_B');
    localStorage.removeItem('MERNEcommerceToken');
    notifyAuthChange('logout');

    // -------------------------------------------------------------
    // 5. Account A logs back in
    // -------------------------------------------------------------
    localStorage.setItem('MERNEcommerceToken', userAToken);
    notifyAuthChange('login');

    // Fetch Account A's cart from server
    const restoredResA = await apiClient.get('cart');
    expect(restoredResA.data.length).toBe(2);
    expect(restoredResA.data.map(i => i.name)).toEqual(['Product Alpha', 'Product Beta']);
    // Ensure Product Gamma never leaked to Account A
    expect(restoredResA.data.some(i => i.name === 'Product Gamma')).toBe(false);

    // Account A removes Product Alpha
    const updatedItems = [itemBeta];
    await apiClient.put('cart', { items: updatedItems });
    setUserItem('fusionCart', updatedItems);

    expect(serverCartDb.get('user_account_A').length).toBe(1);
    expect(serverCartDb.get('user_account_A')[0].name).toBe('Product Beta');

    // -------------------------------------------------------------
    // 6. Switch back to Account B to confirm Account B was unaffected
    // -------------------------------------------------------------
    clearUserSessionData('user_account_A');
    localStorage.removeItem('MERNEcommerceToken');

    localStorage.setItem('MERNEcommerceToken', userBToken);
    notifyAuthChange('login');

    const restoredResB = await apiClient.get('cart');
    expect(restoredResB.data.length).toBe(1);
    expect(restoredResB.data[0].name).toBe('Product Gamma');
  });
});
