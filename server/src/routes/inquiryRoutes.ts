import express from 'express';
import { auth, authorize } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  createInquiry,
  getAllInquiries,
  getInquiryById,
  getInquiryAppointment,
  updateInquiry,
  addResponse,
  getSlotsByDate,
  getMyInquiries,
  getAppointmentAuditLogs,
  cancelInquiry,
  checkAvailability,
} from '../controllers/inquiryController';
import { Request, Response, NextFunction } from 'express';

const router = express.Router();

// Ensure uploads directory exists for inquiries
const uploadsDir = path.join(process.cwd(), 'uploads', 'inquiries');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '-' + file.originalname.replace(/\s+/g, '-'));
  }
});
const upload = multer({ storage });

// Get inquiries for the logged-in resident
router.get('/my-inquiries', auth, (req: any, res: Response, next: NextFunction) => getMyInquiries(req, res, next));

// Create a new inquiry (supports file attachments)
router.post('/', auth, upload.array('attachments'), (req: any, res: Response, next: NextFunction) => createInquiry(req, res, next));

// Get all inquiries
router.get('/', auth, (req: any, res: Response, next: NextFunction) => getAllInquiries(req, res, next));

// Get a specific inquiry
router.get('/:id', auth, (req: any, res: Response, next: NextFunction) => getInquiryById(req, res, next));
// Get appointment details (inquiry + slots) for prefill/editing
router.get('/:id/appointment', auth, authorize('admin', 'staff'), (req: any, res: Response, next: NextFunction) => getInquiryAppointment(req, res, next));
// GET /api/inquiries/slots?date=YYYY-MM-DD
router.get('/slots', auth, authorize('admin', 'staff'), (req: any, res: Response, next: NextFunction) => getSlotsByDate(req, res));
// Appointment audit logs (admin, secretary only)
router.get('/audit-logs', auth, authorize('admin', 'secretary'), (req: any, res: Response, next: NextFunction) => {
  return getAppointmentAuditLogs(req, res);
});
// Update an inquiry (admin and staff only)
router.patch('/:id', auth, authorize('admin', 'staff'), (req: any, res: Response, next: NextFunction) => updateInquiry(req, res, next));

// Some hosting environments or proxies do not allow the HTTP PATCH method.
// Provide a POST-based fallback that performs the same update logic so
// clients that cannot send PATCH can still update inquiries.
router.post('/:id', auth, authorize('admin', 'staff'), (req: any, res: Response, next: NextFunction) => updateInquiry(req, res, next));
// PUT /:id/schedule - explicit scheduling/editing endpoint for appointments
router.put('/:id/schedule', auth, authorize('admin', 'staff'), (req: any, res: Response, next: NextFunction) => updateInquiry(req, res, next));
// Check availability for a set of scheduledDates (staff only) without committing
router.post('/:id/check-availability', auth, authorize('admin', 'staff'), (req: any, res: Response, next: NextFunction) => checkAvailability(req, res, next));

// Cancel an appointment (staff only) with reason
router.patch('/:id/cancel', auth, authorize('admin', 'staff'), (req: any, res: Response, next: NextFunction) => cancelInquiry(req, res, next));

// Add a response to an inquiry (allow resident and staff replies)
// Allow file attachments with responses as well
router.post('/:id/responses', auth, upload.array('attachments'), (req: any, res: Response, next: NextFunction) => addResponse(req, res, next));

export default router;
