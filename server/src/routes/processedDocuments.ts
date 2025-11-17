import { Router, Request, Response } from 'express';

const router = Router();

// Minimal shim for processed documents route
// This file exists so deployments that expect the route won't fail when the
// full implementation is not present. It provides basic list/get/upload stubs.

router.get('/', async (_req: Request, res: Response) => {
  return res.json({ items: [] });
});

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  return res.status(404).json({ message: `Processed document ${id} not found (shim)` });
});

router.post('/upload', async (_req: Request, res: Response) => {
  return res.status(501).json({ message: 'Upload not implemented in shim' });
});

export = router;
