import type { Role } from './roles';

// Section 7.1: length + a common-password check. No forced complexity rules.
export const PASSWORD_MAX_LENGTH = 128;

export function minPasswordLength(role: Role): number {
  return role === 'staff' ? 8 : 10;
}

// Lowercased. Kept short on purpose; length is the main defence.
const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '0123456789',
  '11111111',
  '00000000',
  '87654321',
  '12341234',
  '11223344',
  '123123123',
  'password',
  'password1',
  'password12',
  'password123',
  'passw0rd',
  'p@ssw0rd',
  'qwertyui',
  'qwerty123',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm123',
  '1q2w3e4r',
  '1q2w3e4r5t',
  'abcd1234',
  'abc12345',
  'abcdefgh',
  'iloveyou',
  'iloveyou1',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'basketball',
  'superman',
  'whatever',
  'trustno1',
  'letmein1',
  'welcome1',
  'welcome123',
  'changeme',
  'admin123',
  'administrator',
  'adminadmin',
  'cashier1',
  'cashier123',
  'staff123',
  'pos12345',
  'bilispos',
  'bilispos1',
  'bilispos123',
  'mahalkita',
  'iloveyou2',
  'michael1',
  'starwars',
  'dragon12',
  'monkey123',
  'shadow12',
  'master12',
  'computer',
  'internet',
]);

export type PasswordProblem = 'too_short' | 'too_long' | 'too_common';

export function checkPassword(password: string, role: Role): PasswordProblem | null {
  if (password.length < minPasswordLength(role)) return 'too_short';
  if (password.length > PASSWORD_MAX_LENGTH) return 'too_long';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'too_common';
  if (/^(.)\1+$/.test(password)) return 'too_common';
  return null;
}

export function passwordProblemMessage(problem: PasswordProblem, role: Role): string {
  switch (problem) {
    case 'too_short':
      return `Use at least ${minPasswordLength(role)} characters.`;
    case 'too_long':
      return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
    case 'too_common':
      return 'This password is too easy to guess. Try a short phrase instead.';
  }
}
