const express = require('express');
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Address = require('../models/address');

const router = express.Router();

/**
 * @route   GET /api/address
 * @desc    Get all saved addresses for logged-in user
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const addresses = await Address.find({ user: req.user.id }).sort({ isDefault: -1, createdAt: -1 });
    res.json(addresses);
  } catch (err) {
    console.error('Error fetching addresses:', err.message);
    res.status(500).json({ msg: 'Server error while fetching addresses' });
  }
});

/**
 * @route   GET /api/address/:id
 * @desc    Get address by ID for logged-in user
 * @access  Private
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const address = await Address.findOne({ _id: req.params.id, user: req.user.id });
    if (!address) {
      return res.status(404).json({ msg: 'Address not found' });
    }
    res.json(address);
  } catch (err) {
    console.error('Error fetching address:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

/**
 * @route   POST /api/address
 * @desc    Add a new address for logged-in user
 * @access  Private
 */
router.post(
  '/',
  [
    auth,
    [
      check('fullName', 'Full Name is required').not().isEmpty().trim(),
      check('phone', 'Phone Number is required').not().isEmpty().trim(),
      check('addressLine1', 'Address Line 1 (House/Flat) is required').not().isEmpty().trim(),
      check('city', 'City is required').not().isEmpty().trim(),
      check('state', 'State is required').not().isEmpty().trim(),
      check('pincode', 'Pincode/ZIP code is required').not().isEmpty().trim(),
    ],
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const {
        fullName,
        phone,
        addressLine1,
        addressLine2,
        landmark,
        city,
        state,
        pincode,
        country = 'India',
        addressType = 'Home',
        isDefault = false,
      } = req.body;

      // Count existing addresses for this user
      const existingCount = await Address.countDocuments({ user: req.user.id });

      // If user has no existing addresses, this first one should automatically be default
      let makeDefault = isDefault || existingCount === 0;

      // If this address should be default, unset default on all other addresses
      if (makeDefault) {
        await Address.updateMany({ user: req.user.id }, { isDefault: false });
      }

      const newAddress = new Address({
        user: req.user.id,
        fullName: fullName.trim(),
        phone: phone.trim(),
        addressLine1: addressLine1.trim(),
        addressLine2: (addressLine2 || '').trim(),
        landmark: (landmark || '').trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        country: (country || 'India').trim(),
        addressType: ['Home', 'Work', 'Other'].includes(addressType) ? addressType : 'Home',
        isDefault: makeDefault,
      });

      const savedAddress = await newAddress.save();
      res.status(201).json(savedAddress);
    } catch (err) {
      console.error('Error saving address:', err.message);
      res.status(500).json({ msg: 'Server error while saving address' });
    }
  }
);

/**
 * @route   PUT /api/address/:id
 * @desc    Update an existing address
 * @access  Private
 */
router.put(
  '/:id',
  [
    auth,
    [
      check('fullName', 'Full Name is required').not().isEmpty().trim(),
      check('phone', 'Phone Number is required').not().isEmpty().trim(),
      check('addressLine1', 'Address Line 1 is required').not().isEmpty().trim(),
      check('city', 'City is required').not().isEmpty().trim(),
      check('state', 'State is required').not().isEmpty().trim(),
      check('pincode', 'Pincode is required').not().isEmpty().trim(),
    ],
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const address = await Address.findOne({ _id: req.params.id, user: req.user.id });
      if (!address) {
        return res.status(404).json({ msg: 'Address not found or unauthorized' });
      }

      const {
        fullName,
        phone,
        addressLine1,
        addressLine2,
        landmark,
        city,
        state,
        pincode,
        country = 'India',
        addressType = 'Home',
        isDefault,
      } = req.body;

      if (isDefault === true && !address.isDefault) {
        // Set all other addresses to not default
        await Address.updateMany({ user: req.user.id }, { isDefault: false });
        address.isDefault = true;
      } else if (isDefault !== undefined) {
        address.isDefault = isDefault;
      }

      address.fullName = fullName.trim();
      address.phone = phone.trim();
      address.addressLine1 = addressLine1.trim();
      address.addressLine2 = (addressLine2 || '').trim();
      address.landmark = (landmark || '').trim();
      address.city = city.trim();
      address.state = state.trim();
      address.pincode = pincode.trim();
      address.country = (country || 'India').trim();
      if (['Home', 'Work', 'Other'].includes(addressType)) {
        address.addressType = addressType;
      }

      const updated = await address.save();
      res.json(updated);
    } catch (err) {
      console.error('Error updating address:', err.message);
      res.status(500).json({ msg: 'Server error while updating address' });
    }
  }
);

/**
 * @route   PUT /api/address/:id/default
 * @desc    Set an address as default
 * @access  Private
 */
router.put('/:id/default', auth, async (req, res) => {
  try {
    const address = await Address.findOne({ _id: req.params.id, user: req.user.id });
    if (!address) {
      return res.status(404).json({ msg: 'Address not found' });
    }

    // Unset default on all user addresses
    await Address.updateMany({ user: req.user.id }, { isDefault: false });

    // Set this one to default
    address.isDefault = true;
    const updated = await address.save();

    res.json(updated);
  } catch (err) {
    console.error('Error setting default address:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

/**
 * @route   DELETE /api/address/:id
 * @desc    Delete a saved address
 * @access  Private
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const address = await Address.findOne({ _id: req.params.id, user: req.user.id });
    if (!address) {
      return res.status(404).json({ msg: 'Address not found' });
    }

    const wasDefault = address.isDefault;
    await Address.deleteOne({ _id: req.params.id, user: req.user.id });

    // If the deleted address was default, set another address as default if one exists
    if (wasDefault) {
      const remainingAddress = await Address.findOne({ user: req.user.id }).sort({ createdAt: -1 });
      if (remainingAddress) {
        remainingAddress.isDefault = true;
        await remainingAddress.save();
      }
    }

    res.json({ msg: 'Address deleted successfully' });
  } catch (err) {
    console.error('Error deleting address:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
