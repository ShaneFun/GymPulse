// Field rules for the Me tab, mirroring the Pydantic validators on
// ProfileUpdate in backend/app/main.py. They exist in both places on purpose:
// here so a mistake is an inline message instead of a 422, and there because
// the API is reachable without this UI.
//
// Each validator returns an error string, or '' when the value is fine. They
// are pure, so the editors can call them on every keystroke.

const NAME_PUNCTUATION = " -'.";
const PHONE_SEPARATORS = ' -(). ';

export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 50;
export const MIN_PHONE_DIGITS = 7;
export const MAX_PHONE_DIGITS = 15;
export const EARLIEST_BIRTH_YEAR = 1900;
export const MIN_AGE_YEARS = 10;
export const MIN_PASSWORD_LENGTH = 8;

// Unicode-aware, so accented and non-Latin names pass while digits and
// symbols do not. \p{L} needs the u flag.
const LETTER = /\p{L}/u;

export function validateName(value) {
  const name = value.trim();
  if (!name) return ''; // blank clears the field, which is allowed
  if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    return `Name must be ${MIN_NAME_LENGTH}–${MAX_NAME_LENGTH} characters.`;
  }
  for (const ch of name) {
    if (!LETTER.test(ch) && !NAME_PUNCTUATION.includes(ch)) {
      return 'Name can only contain letters, spaces, hyphens and apostrophes.';
    }
  }
  return '';
}

/** Strips the separators people type, leaving an optional + and digits. */
export function compactPhone(value) {
  return [...value].filter((ch) => !PHONE_SEPARATORS.includes(ch)).join('');
}

export function validatePhone(value) {
  const compact = compactPhone(value);
  if (!compact) return '';
  const digits = compact.startsWith('+') ? compact.slice(1) : compact;
  if (!/^[0-9]+$/.test(digits)) {
    return 'Phone number can only contain digits, spaces and + - ( ).';
  }
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    return `Phone number must have ${MIN_PHONE_DIGITS}–${MAX_PHONE_DIGITS} digits.`;
  }
  return '';
}

export function validateBirthYear(value) {
  const text = value.trim();
  if (!text) return '';
  if (!/^[0-9]{4}$/.test(text)) return 'Enter a four-digit year.';
  // Recomputed per call rather than pinned, so this does not start rejecting
  // the current year on New Year's Day.
  const latest = new Date().getFullYear() - MIN_AGE_YEARS;
  const year = Number(text);
  if (year < EARLIEST_BIRTH_YEAR || year > latest) {
    return `Year of birth must be between ${EARLIEST_BIRTH_YEAR} and ${latest}.`;
  }
  return '';
}

// Deliberately not a full RFC 5322 parser -- that rejects addresses that
// work and accepts ones that don't. This catches typos; the confirmation
// email is what actually proves the address exists.
export function validateEmail(value) {
  const email = value.trim();
  if (!email) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  return '';
}

export function validatePassword(value) {
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(value)) return 'Password must contain a letter.';
  if (!/[0-9]/.test(value)) return 'Password must contain a number.';
  return '';
}
