// Small stroke icons (24×24, currentColor). Decorative: buttons carry their own text or label.
import type { ReactNode } from 'react';

const Svg = ({ children }: { children: ReactNode }) => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconMove = () => (
  <Svg>
    <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
  </Svg>
);
export const IconRotate = () => (
  <Svg>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v5h-5" />
  </Svg>
);
export const IconUndo = () => (
  <Svg>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Svg>
);
export const IconRedo = () => (
  <Svg>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </Svg>
);
export const IconTemplates = () => (
  <Svg>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M9 9v12" />
  </Svg>
);
export const IconGearList = () => (
  <Svg>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V2.5h6V4M9 10h6M9 14h6M9 18h3" />
  </Svg>
);
export const IconExport = () => (
  <Svg>
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </Svg>
);
export const IconMinus = () => (
  <Svg>
    <path d="M5 12h14" />
  </Svg>
);
export const IconPlus = () => (
  <Svg>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconFit = () => (
  <Svg>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Svg>
);
export const IconGrid = () => (
  <Svg>
    <path d="M4 8h16M4 16h16M8 4v16M16 4v16" />
  </Svg>
);
export const IconBack = () => (
  <Svg>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);
export const IconClose = () => (
  <Svg>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const IconMore = () => (
  <Svg>
    <circle cx="5" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="19" cy="12" r="1" fill="currentColor" />
  </Svg>
);
export const IconChevron = ({ up }: { up?: boolean }) => (
  <Svg>
    <path d={up ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
  </Svg>
);
export const IconReset = () => (
  <Svg>
    <path d="M4 12a8 8 0 1 0 2.34-5.66" />
    <path d="M4 4v5h5" />
  </Svg>
);
export const IconEquipment = () => (
  <Svg>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="3" />
  </Svg>
);
export const IconHelp = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7" />
    <path d="M12 17h.01" strokeWidth="2.5" />
  </Svg>
);
