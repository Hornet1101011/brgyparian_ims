import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { User } from '../models/User';

async function createAdmin() {
  // Connect to MongoDB first
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/alphaversion');

  // Log current database name
  console.log('Connected to DB:', mongoose.connection.name);

  // Log all users for debugging
  const allUsers = await User.find({});
  console.log('Current users:', allUsers);

  const existing = await User.findOne({ role: 'admin' });
  if (existing) {
    console.log('Admin already exists:', existing.username);
    return;
  }
  const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
  const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin123@parian';
  const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || 'admin@localhost.local';
  const DEFAULT_ADMIN_BARANGAY_ID = process.env.DEFAULT_ADMIN_BARANGAY_ID || '0000';

  // Let the User model pre-save middleware hash the password; pass plain password
  const admin = new User({
    fullName: 'Administrator',
    role: 'admin',
    username: DEFAULT_ADMIN_USERNAME,
    password: DEFAULT_ADMIN_PASSWORD,
    email: DEFAULT_ADMIN_EMAIL,
    barangayID: DEFAULT_ADMIN_BARANGAY_ID,
  });
  await admin.save();
  console.log(`Admin created: username=${DEFAULT_ADMIN_USERNAME}, password=${DEFAULT_ADMIN_PASSWORD}`);
}

createAdmin().then(() => mongoose.disconnect());
