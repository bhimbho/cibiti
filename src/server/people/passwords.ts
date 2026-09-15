import { randomInt } from "node:crypto";
import { hash } from "bcryptjs";

// Unambiguous characters only: easy to read aloud and type in an exam hall.
const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";

export function generatePassword(length = 10): string {
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");
}

/** Cost 12 for individually created accounts; cost 10 for bulk imports of candidate accounts. */
export function hashPassword(password: string, bulk = false): Promise<string> {
  return hash(password, bulk ? 10 : 12);
}
