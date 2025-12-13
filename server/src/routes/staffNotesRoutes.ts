import express from 'express';
import {
	getStaffNotes,
	addStaffNote,
	editStaffNote,
	deleteStaffNote,
} from '../controllers/staffNotesController';
import { auth as requireAuth, authorize } from '../middleware/auth';

const router = express.Router({ mergeParams: true });

// adapt authorize factory to a requireStaff middleware
const requireStaff = authorize('admin', 'staff', 'secretary');

// All routes require auth + staff role
router.use(requireAuth);
router.use(requireStaff);

router.get('/inquiries/:id/staff-notes', getStaffNotes);
router.post('/inquiries/:id/staff-notes', addStaffNote);
router.put('/inquiries/:id/staff-notes/:noteId', editStaffNote);
router.delete('/inquiries/:id/staff-notes/:noteId', deleteStaffNote);

export default router;
