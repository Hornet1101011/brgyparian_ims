import express, { Request, Response, NextFunction } from 'express';
import { auth, authorize } from '../middleware/auth';
import {
  createDocumentRequest,
  getMyDocumentRequests,
  getAllDocumentRequests,
  processDocumentRequest,
  updatePaymentStatus,
  previewFilledDocument,
  generateFilledDocument,
} from '../controllers/documentRequestController';

const router = express.Router();

// DEBUG: Log all incoming requests to /api/document-requests
router.use((req, res, next) => {
  console.log(`[DocumentRequestRoutes] ${req.method} ${req.path}`, { body: req.body });
  next();
});

// Public routes - allow guest/unauthenticated access for document request creation
router.post('/', (req: any, res: Response) => {
  console.log('[DocumentRequestRoutes] Handling POST /');
  createDocumentRequest(req, res);
});

// IMPORTANT: Place specific routes BEFORE parameter-based routes to avoid matching conflicts
router.post('/preview-filled', (req, res) => previewFilledDocument(req, res));
router.get('/my-requests', auth, (req: any, res: Response) => getMyDocumentRequests(req, res));
router.get('/all', auth, authorize('admin', 'staff'), (req: any, res: Response) => getAllDocumentRequests(req, res));

// Parameter-based routes (must come after specific routes)
router.post('/:id/generate-filled', (req, res) => generateFilledDocument(req, res));
router.patch('/:id/process', auth, authorize('admin', 'staff'), (req: any, res: Response) => processDocumentRequest(req, res));
router.patch('/:id/payment', auth, authorize('admin', 'staff'), (req: any, res: Response) => updatePaymentStatus(req, res));

export default router;
