export function validateEmail(email: string): boolean;
export function validatePassword(password: string): boolean;
export function validateUsername(username: string): boolean;
export function validateBarangayID(id: string): boolean;
export function validatePhoneNumber(phone: string): boolean;

declare const _default: {
  validateEmail: typeof validateEmail;
  validatePassword: typeof validatePassword;
  validateUsername: typeof validateUsername;
  validateBarangayID: typeof validateBarangayID;
  validatePhoneNumber: typeof validatePhoneNumber;
};

export default _default;
