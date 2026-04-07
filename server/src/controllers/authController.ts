import { Request, Response } from 'express';
import { logActivity } from '../middleware/logActivity';
import { User } from '../models/User';
import { Notification } from '../models/Notification';
import { Resident } from '../models/Resident';
import jwt from 'jsonwebtoken';
import { validateEmail, validatePassword } from '../utils/validation';
// runtime require for SendGrid service
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sendGridService: any = require('../../services/emailService.js');
// runtime require for SendGridConfig
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SendGridConfig: any = require('../../models/SendGridConfig.js');

// Types for request bodies
interface RegisterRequest {
  fullName: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  nameExtension?: string;
  name?: string;
  username: string;
  email: string;
  password: string;
  role: 'admin' | 'staff' | 'resident' | 'ADMIN' | 'STAFF' | 'RESIDENT';
  barangayID: string;
  contactNumber?: string;
  address?: string;
  department?: string;
}

interface LoginRequest {
  identifier: string; // can be email or username
  password: string;
}

// Generate JWT Token (now includes username, email, fullName, barangayID, address, contactNumber)
const generateToken = (user: { _id: string, role: string, username: string, email?: string, fullName?: string, barangayID?: string, address?: string, contactNumber?: string }): string => {
  return jwt.sign(
    { 
      _id: user._id, 
      role: user.role, 
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      barangayID: user.barangayID,
      address: user.address,
      contactNumber: user.contactNumber
    },
    process.env.JWT_SECRET || 'defaultsecret',
    { expiresIn: '24h' }
  );
};

export const register = async (req: Request, res: Response, next: unknown) => {
  try {
    const {
      fullName,
      firstName,
      middleName,
      lastName,
      nameExtension,
      name,
      username,
      email,
      password,
      role,
      barangayID,
      contactNumber,
      address,
      department,
    } = req.body as RegisterRequest;
    
    // Support legacy `name` field used by some tests/clients
    const finalFullName = (fullName || (name as any) || '').toString().trim();
    // If username not provided, derive from email local part
    const finalUsername = username || (email ? String(email).split('@')[0] : undefined) || (`user${Date.now()}`);
    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Validate password (minimum length)
    if (!validatePassword(password)) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }


    // Check if email, username, or barangayID already exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ message: 'Username already taken' });
    }
    // Normalize or generate barangayID if not provided
    let finalBarangayID = (barangayID || '').toString().trim();
    if (!finalBarangayID) {
      // Generate in the format: brgyparian-<year>-<6digits>
      let attempts = 0;
      do {
        const year = new Date().getFullYear();
        // generate 6-character mixed-case alphanumeric suffix
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let rand = '';
        for (let i = 0; i < 6; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
        finalBarangayID = `brgyparian-${year}-${rand}`;
        const exists = await User.findOne({ barangayID: finalBarangayID });
        if (!exists) break;
        attempts++;
      } while (attempts < 10);
      if (attempts >= 5) {
        return res.status(500).json({ message: 'Failed to generate unique Barangay ID' });
      }
    } else {
      // If provided, ensure it's not already taken
      const existingBarangayID = await User.findOne({ barangayID: finalBarangayID });
      if (existingBarangayID) {
        return res.status(400).json({ message: 'Barangay ID already registered' });
      }
    }

    // If user is requesting staff via public registration, register as resident and create notification
    let actualRole = (role || 'resident') as any;
    let staffRequest = false;
    const normalizedRole = (actualRole || 'resident').toString().toLowerCase();
    if (
      normalizedRole === 'staff' &&
      (
        !(req as any).user ||
        ((req as any).user as { role?: string }).role !== 'admin'
      )
    ) {
      actualRole = 'resident';
      staffRequest = true;
    } else {
      actualRole = normalizedRole as RegisterRequest['role'];
    }

    // Create new user
    const user = new User({
      fullName: finalFullName,
      username: finalUsername,
      email,
      password,
      role: actualRole,
      barangayID: finalBarangayID,
      contactNumber,
      address,
      department,
      isActive: true,
    });

    await user.save();

  // If user is a resident, create a Resident document for their personal info
  if (actualRole === 'resident') {
      await Resident.create({
        userId: user._id,
        firstName: firstName || (finalFullName.split(' ')[0] || ''),
        middleName: middleName || '',
        lastName: lastName || (finalFullName.split(' ').slice(-1)[0] || ''),
        nameExtension: nameExtension || '',
        barangayID: finalBarangayID,
        email,
        contactNumber,
        address,
      });

    // Send registration confirmation email via SendGrid (async, fire and forget)
    // Log which transport will be used (non-blocking check)
    try {
      const sgCfg = await SendGridConfig.getConfig();
      console.log('[register] SendGrid config present:', { enabled: !!sgCfg?.enabled, fromEmail: sgCfg?.fromEmail });
    } catch (e: any) {
      console.warn('[register] Unable to read SendGrid config for logging', e?.message ?? e);
    }

    // Send via SendGrid only (do not fallback to SMTP)
    (async () => {
      try {
        const displayName = firstName || finalFullName.split(' ')[0] || finalUsername;
        const html = `
          <p>Dear ${displayName},</p>
          <p>Welcome! Your account has been successfully created in the Barangay Information Management System.</p>
          <p><strong>Account Details:</strong></p>
          <ul>
            <li>Username: ${finalUsername}</li>
            <li>Email: ${email}</li>
            <li>Barangay ID: ${finalBarangayID}</li>
          </ul>
          <p>You can now log in with your username or email and password.</p>
          <p>If you have any questions, please contact the barangay office.</p>
          <p>Thank you,<br>Barangay Information Management System</p>
        `;

        console.log('[register] Sending registration confirmation email via SendGrid (no SMTP fallback)');
        await sendGridService.sendEmail({
          to: email,
          subject: 'Welcome to Barangay Information Management System',
          html
        });
      } catch (emailErr: any) {
        console.error('[register] SendGrid failed to send registration email (no fallback):', emailErr?.message ?? emailErr);
      }
    })();
    }


    // If staff request, create notification for admin
    if (staffRequest) {
      try {
        // Find all admins
        const admins = await User.find({ role: 'admin' });
        console.log('[register] Found admins for notification:', admins.length);
        
        for (const admin of admins) {
          try {
            const notif = await Notification.create({
              user: admin._id,
              userId: admin._id,  // Also set userId as backup
              type: 'staff_approval',
              message: `${fullName} (${email}) has requested staff access.`,
              data: { userId: user._id, fullName, email, username },
            });
            console.log('[register] Notification created for admin', String(admin._id), '- notif ID:', String(notif._id));
          } catch (notifErr) {
            console.error('[register] Failed to create notification for admin', String(admin._id), ':', notifErr);
          }
        }
      } catch (adminsErr) {
        console.error('[register] Failed to find admins or create notifications:', adminsErr);
      }
    }

    // Generate token
    const token = generateToken({ 
      _id: String(user._id), 
      role: user.role, 
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      barangayID: user.barangayID,
      address: user.address,
      contactNumber: user.contactNumber
    });

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Log registration activity
    await logActivity(req, 'USER', 'REGISTER', `User ${user.email} registered with role ${user.role}.`);

    res.status(201).json({
      message: staffRequest ? 'Registration successful. Staff request sent to admin.' : 'Registration successful',
      token,
      user: user.userInfo
    });
  } catch (error) {
    console.error('Registration error:', error);
    // If this is a duplicate-key error from Mongo, return 409 Conflict with details
    if (error && (error as any).code === 11000) {
      const e: any = error;
      return res.status(409).json({ message: 'Duplicate key error', keyValue: e.keyValue || {} });
    }
    res.status(500).json({
      message: 'Error during registration',
      error: (error as Error).message
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    // Accept either `identifier` (preferred), or legacy `email`/`username` fields
    const body: any = req.body || {};
    const identifier = body.identifier || body.email || body.username;
    const password = body.password;

    // Find user by email or username
    const user = await User.findByCredentials(identifier);

    if (!user) {
      return res.status(401).json({ message: 'Invalid login credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    // Check if user is suspended until a future date
    if (user.suspendedUntil && user.suspendedUntil instanceof Date && user.suspendedUntil > new Date()) {
      return res.status(403).json({ message: `Account suspended until ${user.suspendedUntil.toISOString()}` });
    }

    // Verify password
    const isPasswordValid = typeof user.comparePassword === 'function'
      ? await user.comparePassword(password)
      : user.password === password;
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid login credentials' });
    }


    // Always normalize role to lowercase for schema compatibility
    if (user.role && typeof user.role === 'string') {
      user.role = user.role.toLowerCase() as typeof user.role;
    }
    // If user is a resident, ensure they have a Resident container
    if (user.role === 'resident') {
      // Use require to avoid ESM import error
      const { Resident } = require('../models/Resident');
      let resident = await Resident.findOne({ barangayID: user.barangayID });
      if (!resident) {
        resident = await Resident.create({
          userId: user._id,
          firstName: user.fullName?.split(' ')[0] || '',
          lastName: user.fullName?.split(' ').slice(-1)[0] || '',
          barangayID: user.barangayID,
          email: user.email,
          contactNumber: user.contactNumber,
          address: user.address,
        });
      } else {
        // Optionally update resident container with latest user info
        resident.userId = user._id;
        resident.email = user.email;
        resident.contactNumber = user.contactNumber;
        resident.address = user.address;
        await resident.save();
      }
    }

    // Generate token
    const token = generateToken({ 
      _id: String(user._id), 
      role: user.role, 
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      barangayID: user.barangayID,
      address: user.address,
      contactNumber: user.contactNumber
    });

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Log activity
    await logActivity(req, 'USER', 'LOGIN', `User ${user.email} logged in.`);
    // Send response with token and basic user info
    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        username: user.username,
        role: user.role,
        fullName: user.fullName,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      message: 'Error during login',
      error: (error as Error).message
    });
  }
};

export const getCurrentUser = async (req: Request, res: Response) => {
  try {
  const userId = ((req as any).user)?._id;
  const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user.userInfo);
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching user profile',
      error: (error as Error).message
    });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const updates = {
      fullName: req.body.fullName,
      contactNumber: req.body.contactNumber,
      address: req.body.address,
    };

    // Prevent barangayID tampering
    if (req.body.barangayID) {
      return res.status(400).json({ message: 'Barangay ID cannot be changed.' });
    }

    const userId = ((req as any).user)?._id;

    // Optionally check for duplicate barangayID (shouldn't happen since it's read-only, but for safety)
    // const existingBarangayID = await User.findOne({ barangayID: req.body.barangayID, _id: { $ne: userId } });
    // if (existingBarangayID) {
    //   return res.status(400).json({ message: 'Barangay ID already registered' });
    // }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: user.userInfo
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating profile',
      error: (error as Error).message
    });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

  const userId = ((req as any).user)?._id;
  const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Validate new password
    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        message: 'New password must be at least 6 characters long and contain at least one number, one uppercase letter, and one special character'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({
      message: 'Error changing password',
      error: (error as Error).message
    });
  }
};

// Example: Add this function if you don't have a resident save/update controller
// Save or update resident information
export const saveResidentInfo = async (req: Request, res: Response) => {
  try {
    const userId = ((req as any).user)?._id;
    // Find resident by userId
    let resident = await Resident.findOne({ userId });
    if (resident) {
      // Update resident info
      Object.assign(resident, req.body);
      await resident.save();
      return res.json({ message: 'Resident information updated successfully', resident });
    } else {
      // Create new resident info
      resident = new Resident({ ...req.body, userId });
      await resident.save();
      return res.status(201).json({ message: 'Resident information saved successfully', resident });
    }
  } catch (error) {
    return res.status(500).json({
      message: 'Error saving resident information',
      error: (error as Error).message
    });
  }
};
