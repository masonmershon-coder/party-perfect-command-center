import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 32;

export function hashTimePin(pin: string, saltHex?: string): string {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : randomBytes(16);
  const hash = scryptSync(pin.trim(), salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyTimePin(pin: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = parts[1];
  const expected = parts[2];
  const actual = hashTimePin(pin, salt);
  const a = Buffer.from(actual.split("$")[2], "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isValidPinShape(pin: string): boolean {
  // Party Perfect keeps existing 4-digit PINs; allow 4–8 for admin resets.
  return /^\d{4,8}$/.test(pin.trim());
}

export function isEmployeePinShape(pin: string): boolean {
  return /^\d{4}$/.test(pin.trim());
}
