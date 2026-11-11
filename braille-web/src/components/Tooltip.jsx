import { useState, useRef } from "react";

export default function Tooltip({ text, children, position = "top" }) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef(null);

  const show = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), 150);
  };

  const hide = () => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && text && (
        <div
          role="tooltip"
          className={`absolute z-50 px-2.5 py-1.5 text-xs font-medium text-white bg-[#0B1C33] dark:bg-[#1E293B] border border-[#1E3A5F] dark:border-[#334155] rounded-lg shadow-md whitespace-nowrap pointer-events-none transition-opacity duration-150 ${positionClasses[position] || positionClasses.top}`}
        >
          {text}
        </div>
      )}
    </div>
  );
}
