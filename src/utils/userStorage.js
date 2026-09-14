/**
 * User storage utility to ensure total data isolation between accounts.
 * All user-specific keys in localStorage are partitioned by the authenticated user's ID.
 */

const TOKEN_KEY = 'MERNEcommerceToken';

/**
 * Retrieve the current authentication token from localStorage.
 */
export function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch (err) {
    console.warn('Unable to access localStorage for auth token', err);
    return null;
  }
}

/**
 * Safely decode the user ID from the JWT token in localStorage.
 * Returns null if not logged in, expired, or invalid.
 */
export function getCurrentUserId() {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Base64 decode payload
    const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);

    // Check expiration if present
    if (payload.exp && typeof payload.exp === 'number') {
      if (payload.exp * 1000 < Date.now()) {
        return null;
      }
    }

    return payload.user?.id || payload.id || payload.sub || null;
  } catch (err) {
    console.warn('Unable to decode auth token', err);
    return null;
  }
}

/**
 * Get a user-scoped storage key.
 * e.g. "fusionCart" -> "fusionCart_64a1b2c3..." or "fusionCart_guest"
 */
export function getUserScopedKey(baseKey, explicitUserId) {
  const userId = explicitUserId !== undefined ? explicitUserId : getCurrentUserId();
  return userId ? `${baseKey}_${userId}` : `${baseKey}_guest`;
}

/**
 * Read and parse JSON from user-scoped storage.
 */
export function getUserItem(baseKey, defaultValue = null) {
  try {
    const key = getUserScopedKey(baseKey);
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return defaultValue;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Unable to read user-scoped item: ${baseKey}`, err);
    return defaultValue;
  }
}

/**
 * Serialize and save JSON to user-scoped storage.
 */
export function setUserItem(baseKey, value) {
  try {
    const key = getUserScopedKey(baseKey);
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Unable to write user-scoped item: ${baseKey}`, err);
  }
}

/**
 * Remove an item from user-scoped storage.
 */
export function removeUserItem(baseKey) {
  try {
    const key = getUserScopedKey(baseKey);
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`Unable to remove user-scoped item: ${baseKey}`, err);
  }
}

/**
 * Trigger an auth change event across the application.
 */
export function notifyAuthChange(type = 'change', detail = {}) {
  try {
    const event = new CustomEvent('fusion_auth_change', {
      detail: {
        type,
        userId: getCurrentUserId(),
        timestamp: Date.now(),
        ...detail,
      },
    });
    window.dispatchEvent(event);
  } catch (err) {
    console.warn('Unable to dispatch auth change event', err);
  }
}

/**
 * Subscribe to auth change and storage events.
 */
export function onAuthChange(callback) {
  const handleAuthChange = event => {
    callback(event.detail);
  };

  const handleStorage = event => {
    if (event.key === TOKEN_KEY) {
      callback({
        type: event.newValue ? 'login' : 'logout',
        userId: getCurrentUserId(),
        timestamp: Date.now(),
      });
    }
  };

  window.addEventListener('fusion_auth_change', handleAuthChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener('fusion_auth_change', handleAuthChange);
    window.removeEventListener('storage', handleStorage);
  };
}

/**
 * Merges guest cart items (from fusionCart_guest) into the authenticated user's cart (fusionCart_{userId}).
 * Preserves products, quantities, avoids duplicate items, and clears guest cart.
 */
export function mergeGuestCartWithUserCart(explicitUserId) {
  try {
    const userId = explicitUserId || getCurrentUserId();
    if (!userId) return [];

    const guestCartRaw = localStorage.getItem('fusionCart_guest') || localStorage.getItem('fusionCart');
    const guestCart = guestCartRaw ? JSON.parse(guestCartRaw) : [];

    if (!Array.isArray(guestCart) || guestCart.length === 0) {
      return getUserItem('fusionCart', []);
    }

    const userCart = getUserItem('fusionCart', []);
    const mergedMap = new Map();

    // 1. Add existing user cart items
    if (Array.isArray(userCart)) {
      for (const item of userCart) {
        const id = String(item._id || item.id || item.productId);
        if (id) {
          mergedMap.set(id, { ...item, _id: id, id: id });
        }
      }
    }

    // 2. Merge guest cart items
    for (const guestItem of guestCart) {
      const id = String(guestItem._id || guestItem.id || guestItem.productId);
      if (!id) continue;

      if (mergedMap.has(id)) {
        const existing = mergedMap.get(id);
        const existingQty = existing.quantity || 1;
        const guestQty = guestItem.quantity || 1;
        existing.quantity = existingQty + guestQty;
      } else {
        mergedMap.set(id, { ...guestItem, _id: id, id: id, quantity: guestItem.quantity || 1 });
      }
    }

    const mergedCart = Array.from(mergedMap.values());

    // Save to user storage
    setUserItem('fusionCart', mergedCart);

    // Clear guest storage
    localStorage.removeItem('fusionCart_guest');
    localStorage.removeItem('fusionCart');

    return mergedCart;
  } catch (err) {
    console.warn('Unable to merge guest cart into user cart:', err);
    return [];
  }
}

/**
 * Clean up user session data on logout.
 * Clears active user-scoped caches and the legacy global keys to prevent any cross-account leakage.
 */
export function clearUserSessionData(userIdToClear) {
  try {
    const targetUserId = userIdToClear || getCurrentUserId();
    if (targetUserId) {
      localStorage.removeItem(`fusionCart_${targetUserId}`);
      localStorage.removeItem(`visitedProducts_${targetUserId}`);
      localStorage.removeItem(`fusionLastOrder_${targetUserId}`);
      localStorage.removeItem(`fusionWishlist_${targetUserId}`);
    }
    // Also clear guest and legacy global keys so no residual items linger
    localStorage.removeItem('fusionCart');
    localStorage.removeItem('visitedProducts');
    localStorage.removeItem('fusionLastOrder');
    localStorage.removeItem('fusionCart_guest');
  } catch (err) {
    console.warn('Unable to clear user session data', err);
  }
}


