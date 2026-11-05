// Small inline icon set (stroke icons, 20px), so the app needs no icon library.

type IconProps = { size?: number };

const base = (size = 20) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

export const IconHighlight = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M15 4l5 5-8 8H7v-5z" /><path d="M4 20h8" /></svg>
);
export const IconLanes = ({ size }: IconProps) => (
  <svg {...base(size)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="M15 4v16" /></svg>
);
export const IconExpand = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M14 4h6v6" /><path d="M10 20H4v-6" /><path d="M20 4l-7 7" /><path d="M4 20l7-7" /></svg>
);
export const IconCollapse = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M20 10h-6V4" /><path d="M4 14h6v6" /><path d="M14 10l7-7" /><path d="M10 14l-7 7" /></svg>
);
export const IconArrowLeft = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></svg>
);
export const IconLink = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
);
export const IconInfo = ({ size }: IconProps) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>
);
export const IconSearch = ({ size }: IconProps) => (
  <svg {...base(size)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
);
export const IconChat = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
);
export const IconFolder = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
);
export const IconBox = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>
);
export const IconList = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></svg>
);
export const IconPlug = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M9 7V3M15 7V3" /><path d="M6 7h12v4a6 6 0 0 1-12 0z" /><path d="M12 17v4" /></svg>
);
export const IconPower = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M12 3v8" /><path d="M6.3 6.3a8 8 0 1 0 11.4 0" /></svg>
);
export const IconCheck = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const IconDot = ({ size }: IconProps) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="4" /></svg>
);
export const IconPlay = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M7 4.5v15l12-7.5z" /></svg>
);
export const IconGraph = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 8.2 7.8 15M12 8.2 16.2 15M9.2 17.2h5.6" />
    <circle cx="12" cy="5.4" r="2.7" fill="currentColor" stroke="none" />
    <circle cx="6.2" cy="17.6" r="2.7" fill="currentColor" stroke="none" />
    <circle cx="17.8" cy="17.6" r="2.7" fill="currentColor" stroke="none" />
  </svg>
);
export const IconTerminal = ({ size }: IconProps) => (
  <svg {...base(size)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M12 15h5" /></svg>
);
export const IconCode = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M9 7l-5 5 5 5M15 7l5 5-5 5" /></svg>
);
export const IconGlobe = ({ size }: IconProps) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
);
export const IconCopy = ({ size }: IconProps) => (
  <svg {...base(size)}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
);
// Adjustments of one thing (a project's settings), unlike the gear of Moki's own Settings.
export const IconSliders = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M4 6h9" /><path d="M17 6h3" /><circle cx="15" cy="6" r="2" /><path d="M4 12h3" /><path d="M11 12h9" /><circle cx="9" cy="12" r="2" /><path d="M4 18h11" /><path d="M19 18h1" /><circle cx="17" cy="18" r="2" /></svg>
);
// A status, not an action: a circle half filled (work under way).
export const IconProgress = ({ size }: IconProps) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M12 7a5 5 0 0 1 0 10z" fill="currentColor" stroke="none" /></svg>
);
export const IconRefresh = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>
);
export const IconMemory = ({ size }: IconProps) => (
  <svg {...base(size)}><rect x="3" y="7" width="18" height="10" rx="1.5" /><path d="M7 11v2M11 11v2M15 11v2M7 17v3M12 17v3M17 17v3" /></svg>
);
export const IconFile =({ size }: IconProps) => (
  <svg {...base(size)}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
);
export const IconHome = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>
);
export const IconChevron = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M9 6l6 6-6 6" /></svg>
);
export const IconEdit = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></svg>
);
export const IconEye = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const IconEyeOff = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M3 3l18 18" /><path d="M10.6 6.1A9.5 9.5 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3.2 3.8" /><path d="M6.1 6.1C3.5 7.9 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.2-.9" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
);
export const IconExternal = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>
);
export const IconDownload = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></svg>
);
export const IconMore = ({ size }: IconProps) => (
  <svg {...base(size)}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
);
export const IconX = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const IconPlus = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconPanel = ({ size }: IconProps) => (
  <svg {...base(size)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></svg>
);
export const IconUsers = ({ size }: IconProps) => (
  <svg {...base(size)}><circle cx="9" cy="8" r="3.5" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6 6 0 0 1 3 5.5" /></svg>
);
export const IconTrash = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
);
export const IconSun = ({ size }: IconProps) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></svg>
);
export const IconMoon = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z" /></svg>
);
export const IconSettings = ({ size }: IconProps) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
);
export const IconOpenProject = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M3.5 17.5V6a1 1 0 0 1 1-1h4.2l2 2H17a1 1 0 0 1 1 1v2"/><path d="M3.5 18.5l2.7-7.4a1.4 1.4 0 0 1 1.3-.9H20.6a.9.9 0 0 1 .85 1.2l-2.4 6.6a1.4 1.4 0 0 1-1.3.9H4.4a.9.9 0 0 1-.9-.4Z"/></svg>
);
export const IconNotes = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M5 4h14a1 1 0 0 1 1 1v9.5L14.5 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M14 20v-4.5a1 1 0 0 1 1-1h5"/><path d="M8 8.5h8M8 12h4.5"/></svg>
);
export const IconMcp = ({ size }: IconProps) => (
  <svg {...base(size)}><rect x="4" y="4" width="16" height="6.5" rx="2"/><rect x="4" y="13.5" width="16" height="6.5" rx="2"/><path d="M7.5 7.25h.01M7.5 16.75h.01M11 7.25h5.5M11 16.75h5.5"/></svg>
);
export const IconSkill = ({ size }: IconProps) => (
  <svg {...base(size)}><path d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z"/><path d="M19 16.5v4M17 18.5h4"/></svg>
);
export const IconAgent = ({ size }: IconProps) => (
  <svg {...base(size)}><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4.5"/><circle cx="12" cy="3.5" r="1"/><path d="M9 13.5v1M15 13.5v1"/><path d="M2 13v3M22 13v3"/></svg>
);
export const IconStar = ({ size }: IconProps) => (
  <svg {...base(size)}><path className="star-shape" d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" /></svg>
);
export const IconPin = ({ size }: IconProps) => (
  <svg {...base(size)}><path className="pin-head" d="M10 3.5h4v5.2l2.8 3.3H7.2L10 8.7z" /><path d="M8.8 3.5h6.4M12 12v8.3" /></svg>
);
