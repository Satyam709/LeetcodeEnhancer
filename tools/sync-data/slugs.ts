/**
 * Turn a source-repo company folder name into a LeetCode-style slug.
 * Lowercase; any run of non-alphanumerics becomes a single "-"; edges trimmed.
 */
export function deriveCompanySlug(folderName: string): string {
  return folderName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Curated aliases win over derivation — used where LeetCode's own company
 * slug differs from the source repo's folder name (see company-aliases.json).
 */
export function resolveCompanySlug(
  folderName: string,
  aliases: Record<string, string>
): string {
  return aliases[folderName] ?? deriveCompanySlug(folderName);
}
