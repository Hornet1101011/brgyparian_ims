import mongoose, { Document } from 'mongoose';

export interface INotification extends Document {
  userId?: mongoose.Types.ObjectId; // may be stored as `userId` or legacy `user`
  user?: mongoose.Types.ObjectId;
  type: string; // allow flexible types (e.g., 'staff_approval', 'staff_access')
  title?: string;
  message: string;
  data?: any; // arbitrary payload (requester details)
  read: boolean;
  createdAt: Date;
}

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // legacy field name sometimes used by scripts
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // allow arbitrary type strings so staff-related notifications are supported
  type: { type: String, required: true },
  title: { type: String },
  message: { type: String, required: true },
  // store additional payload such as requester info
  data: { type: mongoose.Schema.Types.Mixed },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Guard against recompilation in dev
export const Notification: mongoose.Model<INotification> = (mongoose.models && (mongoose.models as any).Notification)
  ? (mongoose.models as any).Notification as mongoose.Model<INotification>
  : mongoose.model<INotification>('Notification', notificationSchema);
