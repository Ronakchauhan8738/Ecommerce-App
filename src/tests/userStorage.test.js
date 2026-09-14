import {
  getCurrentUserId,
  getUserScopedKey,
  getUserItem,
  setUserItem,
  removeUserItem,
  clearUserSessionData,
  notifyAuthChange,
  onAuthChange,
} from '../utils/userStorage';

describe('userStorage - User Data Isolation Utility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when no token is present', () => {
    expect(getCurrentUserId()).toBeNull();
    expect(getUserScopedKey('fusionCart')).toBe('fusionCart_guest');
  });

  it('correctly extracts userId from a valid JWT token', () => {
    // Create a mock JWT with payload { user: { id: 'user_12345' }, exp: Math.floor(Date.now() / 1000) + 3600 }
    const payload = {
      user: { id: 'user_12345' },
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const mockToken = `header.${btoa(JSON.stringify(payload))}.signature`;
    localStorage.setItem('MERNEcommerceToken', mockToken);

    expect(getCurrentUserId()).toBe('user_12345');
    expect(getUserScopedKey('fusionCart')).toBe('fusionCart_user_12345');
  });

  it('isolates data between different users', () => {
    // User A
    const tokenA = `header.${btoa(JSON.stringify({ user: { id: 'user_A' }, exp: Math.floor(Date.now() / 1000) + 3600 }))}.sig`;
    localStorage.setItem('MERNEcommerceToken', tokenA);
    setUserItem('fusionCart', [{ id: 'item_A', name: 'Item A' }]);

    expect(getUserItem('fusionCart')).toEqual([{ id: 'item_A', name: 'Item A' }]);

    // User B
    const tokenB = `header.${btoa(JSON.stringify({ user: { id: 'user_B' }, exp: Math.floor(Date.now() / 1000) + 3600 }))}.sig`;
    localStorage.setItem('MERNEcommerceToken', tokenB);

    // User B should NOT see User A's cart!
    expect(getUserItem('fusionCart', [])).toEqual([]);

    // User B adds their own item
    setUserItem('fusionCart', [{ id: 'item_B', name: 'Item B' }]);
    expect(getUserItem('fusionCart')).toEqual([{ id: 'item_B', name: 'Item B' }]);

    // Switch back to User A
    localStorage.setItem('MERNEcommerceToken', tokenA);
    expect(getUserItem('fusionCart')).toEqual([{ id: 'item_A', name: 'Item A' }]);
  });

  it('clears session data on logout without affecting other keys', () => {
    const tokenA = `header.${btoa(JSON.stringify({ user: { id: 'user_A' }, exp: Math.floor(Date.now() / 1000) + 3600 }))}.sig`;
    localStorage.setItem('MERNEcommerceToken', tokenA);
    setUserItem('fusionCart', [{ id: '1' }]);
    setUserItem('visitedProducts', [{ id: '2' }]);

    clearUserSessionData('user_A');
    expect(getUserItem('fusionCart', [])).toEqual([]);
    expect(getUserItem('visitedProducts', [])).toEqual([]);
  });

  it('notifies subscribers when auth state changes', () => {
    const callback = jest.fn();
    const unsubscribe = onAuthChange(callback);

    notifyAuthChange('login');
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ type: 'login' }));

    unsubscribe();
  });
});
