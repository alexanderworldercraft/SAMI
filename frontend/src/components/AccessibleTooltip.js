import React, { cloneElement, isValidElement, useId, useState } from "react";

const AccessibleTooltip = ({ children, content, label }) => {
  const generatedId = useId();
  const tooltipId = `tooltip-${generatedId.replace(/:/g, "")}`;
  const [visible, setVisible] = useState(false);
  const describedChild = isValidElement(children)
    ? cloneElement(children, {
        "aria-describedby": [children.props["aria-describedby"], tooltipId]
          .filter(Boolean)
          .join(" "),
      })
    : children;

  return (
    <span
      className="relative inline-flex"
      tabIndex={0}
      aria-label={label}
      aria-describedby={tooltipId}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setVisible(false);
          event.currentTarget.blur();
        }
      }}
    >
      {describedChild}
      <span
        id={tooltipId}
        role="tooltip"
        hidden={!visible}
        className={`pointer-events-none absolute bottom-full left-1/2 z-50 mb-3 w-72 -translate-x-1/2 rounded-lg border border-sky-200/20 bg-slate-950 px-3 py-2 text-left text-xs font-semibold leading-5 text-white shadow-xl transition duration-150 ${
          visible ? "visible translate-y-0 opacity-100" : "invisible translate-y-1 opacity-0"
        }`}
      >
        {content}
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-full size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-sky-200/20 bg-slate-950"
        />
      </span>
    </span>
  );
};

export default AccessibleTooltip;
