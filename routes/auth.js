'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authLimiter } = require('../middleware/security');
const authController = require('../controllers/authController');

const router = express.Router();

router.get('/login', asyncHandler(authController.showLogin));
router.post('/login', authLimiter, asyncHandler(authController.login));
router.get('/register', asyncHandler(authController.showRegister));
router.post('/register', authLimiter, asyncHandler(authController.register));
router.post('/logout', asyncHandler(authController.logout));

module.exports = router;
