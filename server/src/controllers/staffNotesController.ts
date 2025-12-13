import { Request, Response } from 'express';
import { Inquiry } from '../models/Inquiry';
import mongoose from 'mongoose';

const isStaff = (user: any) => {
  return user && user.role && ['staff', 'admin', 'secretary'].includes(user.role);
};

export const getStaffNotes = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid inquiry ID' });

    const inquiry = await Inquiry.findById(id).select('staffNotes').lean();
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found' });

    return res.json({ success: true, notes: inquiry.staffNotes || [] });
  } catch (err) {
    console.error('getStaffNotes:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const addStaffNote = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const user = req.user;

    if (!isStaff(user)) return res.status(403).json({ error: 'Access denied' });
    if (!text || text.trim().length < 1) return res.status(400).json({ error: 'Note text required' });

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid inquiry ID' });

    const note = {
      _id: new mongoose.Types.ObjectId(),
      text: text.trim(),
      createdBy: user.id || user._id,
      createdByName: user.name || user.fullName || '',
      createdAt: new Date(),
    } as any;

    const inquiry = await Inquiry.findByIdAndUpdate(
      id,
      { $push: { staffNotes: note } },
      { new: true, runValidators: true }
    ).select('staffNotes');

    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found' });

    const created = (inquiry.staffNotes || []).find((n: any) => String(n._id) === String(note._id));
    return res.status(201).json({ success: true, note: created });
  } catch (err) {
    console.error('addStaffNote:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const editStaffNote = async (req: any, res: Response) => {
  try {
    const { id, noteId } = req.params;
    const { text } = req.body;
    const user = req.user;

    if (!isStaff(user)) return res.status(403).json({ error: 'Access denied' });
    if (!text || text.trim().length < 1) return res.status(400).json({ error: 'Note text required' });

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(noteId)) {
      return res.status(400).json({ error: 'Invalid ids' });
    }

    const inquiry = await Inquiry.findOneAndUpdate(
      { _id: id, 'staffNotes._id': noteId },
      {
        $set: {
          'staffNotes.$.text': text.trim(),
          'staffNotes.$.updatedAt': new Date(),
        },
      },
      { new: true, runValidators: true }
    ).select('staffNotes');

    if (!inquiry) return res.status(404).json({ error: 'Note or inquiry not found' });

    const updated = (inquiry.staffNotes || []).find((n: any) => String(n._id) === String(noteId));
    return res.json({ success: true, note: updated });
  } catch (err) {
    console.error('editStaffNote:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const deleteStaffNote = async (req: any, res: Response) => {
  try {
    const { id, noteId } = req.params;
    const user = req.user;

    if (!isStaff(user)) return res.status(403).json({ error: 'Access denied' });

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(noteId)) {
      return res.status(400).json({ error: 'Invalid ids' });
    }

    const inquiry = await Inquiry.findByIdAndUpdate(
      id,
      { $pull: { staffNotes: { _id: noteId } } },
      { new: true }
    ).select('staffNotes');

    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found' });

    return res.json({ success: true, notes: inquiry.staffNotes || [] });
  } catch (err) {
    console.error('deleteStaffNote:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
