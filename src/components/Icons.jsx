// Same 24px icon set as the Figma "Icons" section.

const svg = (size, className, children, fill = 'none') => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} className={className} aria-hidden="true">
    {children}
  </svg>
);
const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const HeartIcon = ({ size = 20, className }) =>
  svg(
    size,
    className,
    <path
      d="M12 20.5s-7.6-4.5-9.4-9.1C1.2 7.8 3.5 4.5 7 4.5c2.1 0 3.7 1.1 5 2.8 1.3-1.7 2.9-2.8 5-2.8 3.5 0 5.8 3.3 4.4 6.9-1.8 4.6-9.4 9.1-9.4 9.1z"
      fill="currentColor"
    />,
  );
export const EyeIcon = ({ size = 20, className }) =>
  svg(
    size,
    className,
    <>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" {...stroke} />
      <circle cx="12" cy="12" r="3" {...stroke} />
    </>,
  );
export const EyeOffIcon = ({ size = 20, className }) =>
  svg(
    size,
    className,
    <>
      <path
        d="M3 3l18 18M10.6 5.6A10 10 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3.2 3.9M6.6 6.6C3.7 8.4 2 12 2 12s3.6 6.5 10 6.5c1.6 0 3-.4 4.3-1"
        {...stroke}
      />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" {...stroke} />
    </>,
  );
export const ClockIcon = ({ size = 20, className }) =>
  svg(
    size,
    className,
    <>
      <circle cx="12" cy="12" r="9" {...stroke} />
      <path d="M12 7v5l3 2" {...stroke} />
    </>,
  );
export const RepeatIcon = ({ size = 16, className }) =>
  svg(
    size,
    className,
    <path d="M4 11V9a3 3 0 0 1 3-3h12M16 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H5M8 21l-3-3 3-3" {...stroke} />,
  );
export const ReviewIcon = ({ size = 16, className }) =>
  svg(size, className, <path d="M5 5h14M5 10h14M5 15h9" {...stroke} />);
export const PlusIcon = ({ size = 16, className }) =>
  svg(size, className, <path d="M12 5v14M5 12h14" {...stroke} strokeWidth={2.4} />);
export const XIcon = ({ size = 18, className }) => svg(size, className, <path d="M6 6l12 12M18 6L6 18" {...stroke} />);
export const SearchIcon = ({ size = 16, className }) =>
  svg(
    size,
    className,
    <>
      <circle cx="11" cy="11" r="7" {...stroke} />
      <path d="M20 20l-4-4" {...stroke} />
    </>,
  );
export const PencilIcon = ({ size = 16, className }) =>
  svg(size, className, <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" {...stroke} />);
export const ChevronIcon = ({ size = 18, className, dir = 'right' }) =>
  svg(size, className, <path d={dir === 'right' ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} {...stroke} />);
export const BellIcon = ({ size = 20, className }) =>
  svg(
    size,
    className,
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z" {...stroke} />
      <path d="M10 19a2 2 0 0 0 4 0" {...stroke} />
    </>,
  );
export const CommentIcon = ({ size = 16, className }) =>
  svg(size, className, <path d="M4 5h16v11H9l-5 4V5z" {...stroke} />);
export const HeartOutlineIcon = ({ size = 16, className }) =>
  svg(
    size,
    className,
    <path
      d="M12 20.5s-7.6-4.5-9.4-9.1C1.2 7.8 3.5 4.5 7 4.5c2.1 0 3.7 1.1 5 2.8 1.3-1.7 2.9-2.8 5-2.8 3.5 0 5.8 3.3 4.4 6.9-1.8 4.6-9.4 9.1-9.4 9.1z"
      {...stroke}
    />,
  );
export const ThumbDownIcon = ({ size = 16, className, filled = false }) =>
  svg(
    size,
    className,
    <>
      <path d="M17 14V3" {...stroke} />
      <path
        d="M9 18.5 10 14H5.5a2 2 0 0 1-2-2.3l1.2-6.9A2 2 0 0 1 6.7 3H17v11l-4 7a2.2 2.2 0 0 1-4-2.5z"
        {...stroke}
        fill={filled ? 'currentColor' : 'none'}
      />
    </>,
  );
