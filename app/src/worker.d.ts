// Vite's "?worker&inline" imports (the pdf.js worker, bundled into the page and started from a blob: URL).
declare module '*?worker&inline' { const W: new () => Worker; export default W; }
