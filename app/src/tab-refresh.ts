// When must an open tab read its file again after the project changed on disk? The tree (one stat per file) already
// says: a tab is read again only when the file's size or modification time differs from what the tab last saw.
// A PDF or image tab keeps no bytes (it holds the URL it loads from), so its stamp is the one in its content.

export interface Stamp { size?: number; mtime?: number }
// The part of the app's FileContent this rule reads (kept structural: this module is also loaded by node --test).
export interface Held { kind: string; size?: number; mtime?: number }

// What a tab last saw of its file. A PDF or image carries it (size and mtime of the stat taken before its URL was
// granted); any other tab keeps `seen`: the tree's stamp taken BEFORE its read (a change in between only costs one
// extra read, never a missed one).
export const stampOf = (content: Held, seen?: Stamp): Stamp | undefined =>
  (content.kind === 'pdf' || content.kind === 'image') && content.size !== undefined ? { size: content.size, mtime: content.mtime } : seen;

// true = read again. Without a fresh tree, without the file in it (removed, or not listed: the read then fails and the
// tab stays as it was) or without a known stamp, read again (the safe side). A dirty tab is never touched (caller).
export const needsReread = (seen: Stamp | undefined, node: Stamp | null | undefined): boolean =>
  !seen || !node || seen.size === undefined || seen.mtime === undefined || node.size !== seen.size || node.mtime !== seen.mtime;
