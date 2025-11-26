import express from 'express';
import { auth, authorize } from '../middleware/auth';
import appointmentController from '../controllers/appointmentController';

const router = express.Router();

// GET /api/appointments/summary/today
router.get('/summary/today', auth, authorize('admin', 'staff'), (req, res) => appointmentController.getTodaySummary(req, res));

// GET /api/appointments/slots?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/slots', auth, authorize('admin', 'staff'), (req, res) => appointmentController.getSlotsInRange(req, res));

export default router;
