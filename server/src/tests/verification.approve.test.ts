import mongoose from 'mongoose';
import { adminApproveHandler, adminVerifyUserHandler } from '../routes/verificationRoutes';

jest.mock('../models/VerificationRequest');
jest.mock('../models/User');
jest.mock('../models/Notification');
jest.mock('../utils/gridfs');
jest.mock('../utils/sse.js');

const VerificationRequest = require('../models/VerificationRequest').VerificationRequest;
const User = require('../models/User').User;
const Notification = require('../models/Notification').Notification;
const { ensureBucket } = require('../utils/gridfs');
const { sendToUser } = require('../utils/sse.js');

describe('Verification approval flows', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // mock mongoose session behaviour
    jest.spyOn(mongoose, 'startSession').mockImplementation(async () => {
      return {
        withTransaction: async (cb: any) => await cb(),
        endSession: () => {},
      } as any;
    });
  });

  it('approving a request sets user.verified and audit fields and deletes request', async () => {
    const mockVr = { _id: 'vr1', userId: 'user1', gridFileIds: ['g1', 'g2'] };
    const mockUser: any = { _id: 'user1', set: jest.fn(), save: jest.fn().mockResolvedValue(true), get: jest.fn().mockReturnValue(true) };

    VerificationRequest.findById = jest.fn().mockImplementation((id: any) => ({ session: async () => mockVr }));
    VerificationRequest.deleteOne = jest.fn().mockImplementation(() => ({ session: async () => ({}) }));
    User.findById = jest.fn().mockImplementation((id: any) => ({ session: async () => mockUser }));
    Notification.create = jest.fn().mockResolvedValue(true);
    const bucketDelete = jest.fn().mockResolvedValue(true);
    ensureBucket.mockReturnValue({ delete: bucketDelete });
    sendToUser.mockImplementation(() => {});

    const req: any = { params: { id: 'vr1' }, user: { _id: 'admin1' } };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await adminApproveHandler(req, res);

    expect(User.findById).toHaveBeenCalled();
    expect(mockUser.set).toHaveBeenCalledWith('verified', true);
    expect(mockUser.set).toHaveBeenCalledWith('verifiedAt', expect.any(Date));
    expect(mockUser.set).toHaveBeenCalledWith('verifiedBy', 'admin1');
    expect(VerificationRequest.deleteOne).toHaveBeenCalled();
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ user: mockVr.userId, type: 'verification_result' }));
  });
});
