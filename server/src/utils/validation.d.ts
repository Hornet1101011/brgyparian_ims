export function validateEmail(email: string): boolean;
export function validatePassword(password: string): boolean;
export function validateUsername(username: string): boolean;
export function validateBarangayID(id: string): boolean;
export function normalizeBarangayID(id?: string): string | undefined;
export function validatePhoneNumber(phone: string): boolean;

declare const _default: {
  validateEmail: typeof validateEmail;
  validatePassword: typeof validatePassword;
  validateUsername: typeof validateUsername;
  validateBarangayID: typeof validateBarangayID;
  normalizeBarangayID: typeof normalizeBarangayID;
  validatePhoneNumber: typeof validatePhoneNumber;
};

export default _default;
