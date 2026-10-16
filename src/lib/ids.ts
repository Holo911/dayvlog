import { createHash, randomBytes, randomInt } from "node:crypto";

export const newId = () => randomBytes(12).toString("base64url");

export const newToken = () => randomBytes(32).toString("base64url");

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

// No 0/O/1/I/L so codes survive being read out loud or typed from a screenshot.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newInviteCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
