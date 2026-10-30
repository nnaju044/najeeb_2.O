'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { exportLimiter } = require('../middleware/security');

const dashboardController = require('../controllers/dashboardController');
const challengeController = require('../controllers/challengeController');
const timeController = require('../controllers/timeController');
const waterController = require('../controllers/waterController');
const foodController = require('../controllers/foodController');
const sleepController = require('../controllers/sleepController');
const gymController = require('../controllers/gymController');
const weightController = require('../controllers/weightController');
const habitController = require('../controllers/habitController');
const workController = require('../controllers/workController');
const progressController = require('../controllers/progressController');
const settingsController = require('../controllers/settingsController');
const healthController = require('../controllers/healthController');
const prayerController = require('../controllers/prayerController');

const router = express.Router();

router.get('/', asyncHandler(dashboardController.index));
router.get('/health', asyncHandler(healthController.show));
router.get('/prayer', asyncHandler(prayerController.show));
router.get('/prayer/:dateKey', asyncHandler(prayerController.show));

router.get('/challenge', asyncHandler(challengeController.show));
router.post('/challenge/start', asyncHandler(challengeController.start));
router.post('/settings/targets', asyncHandler(challengeController.updateTargets));

router.get('/time', asyncHandler(timeController.show));
router.get('/time/:dateKey', asyncHandler(timeController.show));

router.get('/water', asyncHandler(waterController.show));
router.get('/water/:dateKey', asyncHandler(waterController.show));

router.get('/food', asyncHandler(foodController.show));
router.get('/food/:dateKey', asyncHandler(foodController.show));

router.get('/sleep', asyncHandler(sleepController.show));
router.get('/sleep/:dateKey', asyncHandler(sleepController.show));

router.get('/gym', asyncHandler(gymController.show));
router.get('/weight', asyncHandler(weightController.show));

router.get('/habits', asyncHandler(habitController.show));
router.get('/habits/:dateKey', asyncHandler(habitController.show));

router.get('/work', asyncHandler(workController.show));
router.get('/progress', asyncHandler(progressController.show));

router.get('/settings', asyncHandler(settingsController.show));
router.get('/export/json', exportLimiter, asyncHandler(settingsController.downloadJson));
router.get('/export/csv/:dataset', exportLimiter, asyncHandler(settingsController.downloadCsv));

module.exports = router;
