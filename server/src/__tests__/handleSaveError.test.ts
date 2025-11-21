import { handleSaveError } from '../utils/handleSaveError';

describe('handleSaveError', () => {
  test('returns true and sends 409 when error is duplicate-key and res provided', () => {
    const err: any = { code: 11000, keyValue: { email: 'a@b.com' } };
    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn().mockReturnThis();
    const res: any = { status: statusMock, json: jsonMock };

    const handled = handleSaveError(err, res);
    expect(handled).toBe(true);
    expect(statusMock).toHaveBeenCalledWith(409);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Duplicate key error' }));
  });

  test('returns true when error is duplicate-key and no res provided (no throw)', () => {
    const err: any = { code: 11000, keyValue: { username: 'bob' } };
    const handled = handleSaveError(err);
    expect(handled).toBe(true);
  });

  test('returns false for non-duplicate errors', () => {
    const err: any = new Error('some other error');
    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn().mockReturnThis();
    const res: any = { status: statusMock, json: jsonMock };

    const handled = handleSaveError(err, res);
    expect(handled).toBe(false);
    expect(statusMock).not.toHaveBeenCalled();
    expect(jsonMock).not.toHaveBeenCalled();
  });
});
