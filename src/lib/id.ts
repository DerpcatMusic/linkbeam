export function newId(prefix: string): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${value}`;
}

export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

export function assertSlug(slug: string): string {
  const normalized = normalizeSlug(slug);
  if (!normalized || normalized.length < 2) throw new Error("Slug must be at least 2 characters.");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,70}[a-z0-9])?$/.test(normalized)) throw new Error("Slug contains invalid characters.");
  return normalized;
}

export function isBareIsrc(input: string): boolean {
  const value = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(value);
}

export function normalizeIsrc(input: string): string {
  const value = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(value)) throw new Error("ISRC must look like USABC2400001.");
  return value;
}
