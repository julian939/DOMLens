(() => {
  const GROUPS = [
    { id: "box",        label: "Box" },
    { id: "layout",     label: "Layout" },
    { id: "colors",     label: "Colors" },
    { id: "typography", label: "Typography" },
    { id: "content",    label: "Content" }
  ];

  function rect(el) {
    return el.getBoundingClientRect();
  }

  function shorthand(top, right, bottom, left) {
    if (top === right && right === bottom && bottom === left) return top;
    if (top === bottom && left === right) return `${top} ${right}`;
    if (left === right) return `${top} ${right} ${bottom}`;
    return `${top} ${right} ${bottom} ${left}`;
  }

  function marginValue(_el, cs) {
    return shorthand(cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft);
  }

  function paddingValue(_el, cs) {
    return shorthand(cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft);
  }

  function borderValue(_el, cs) {
    const width = cs.borderTopWidth;
    const style = cs.borderTopStyle;
    const color = cs.borderTopColor;
    if (!width || width === "0px" || style === "none") return "none";
    return `${width} ${style} ${color}`;
  }

  function borderRadiusValue(_el, cs) {
    const tl = cs.borderTopLeftRadius;
    const tr = cs.borderTopRightRadius;
    const br = cs.borderBottomRightRadius;
    const bl = cs.borderBottomLeftRadius;
    return shorthand(tl, tr, br, bl);
  }

  function cleanFontFamily(value) {
    if (!value) return "";
    const first = value.split(",")[0].trim();
    return first.replace(/^["']|["']$/g, "");
  }

  function isTransparent(value) {
    if (!value) return true;
    if (value === "transparent") return true;
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
    if (parts.length === 4 && parts[3] === 0) return true;
    return false;
  }

  const REGISTRY = [
    // BOX
    {
      id: "dimensions", group: "box", label: "Dimensions", defaultEnabled: true,
      getValue: (el) => {
        const r = rect(el);
        return { kind: "text", text: `${Math.round(r.width)} x ${Math.round(r.height)} px` };
      }
    },
    {
      id: "coordinates", group: "box", label: "Coordinates", defaultEnabled: true,
      getValue: (el) => {
        const r = rect(el);
        return { kind: "text", text: `${Math.round(r.left)}, ${Math.round(r.top)}` };
      }
    },
    {
      id: "margin", group: "box", label: "Margin", defaultEnabled: false,
      getValue: (el, cs) => ({ kind: "text", text: marginValue(el, cs) })
    },
    {
      id: "padding", group: "box", label: "Padding", defaultEnabled: false,
      getValue: (el, cs) => ({ kind: "text", text: paddingValue(el, cs) })
    },
    {
      id: "border", group: "box", label: "Border", defaultEnabled: false,
      getValue: (el, cs) => ({ kind: "text", text: borderValue(el, cs) })
    },
    {
      id: "borderRadius", group: "box", label: "Border-radius", defaultEnabled: false,
      getValue: (el, cs) => ({ kind: "text", text: borderRadiusValue(el, cs) })
    },

    // LAYOUT
    {
      id: "display", group: "layout", label: "Display", defaultEnabled: false,
      getValue: (_el, cs) => ({ kind: "text", text: cs.display })
    },
    {
      id: "positionType", group: "layout", label: "Position", defaultEnabled: false,
      getValue: (_el, cs) => ({ kind: "text", text: cs.position })
    },
    {
      id: "zIndex", group: "layout", label: "Z-index", defaultEnabled: false,
      getValue: (_el, cs) => ({ kind: "text", text: cs.zIndex })
    },
    {
      id: "overflow", group: "layout", label: "Overflow", defaultEnabled: false,
      getValue: (_el, cs) => ({ kind: "text", text: cs.overflow })
    },
    {
      id: "opacity", group: "layout", label: "Opacity", defaultEnabled: false,
      getValue: (_el, cs) => ({ kind: "text", text: cs.opacity })
    },
    {
      id: "cursor", group: "layout", label: "Cursor", defaultEnabled: false,
      getValue: (_el, cs) => ({ kind: "text", text: cs.cursor })
    },

    // COLORS
    {
      id: "color", group: "colors", label: "Color", defaultEnabled: true,
      getValue: (_el, cs) => ({ kind: "color", color: cs.color, text: cs.color })
    },
    {
      id: "background", group: "colors", label: "Background", defaultEnabled: true,
      getValue: (_el, cs) => {
        const bg = cs.backgroundColor;
        if (isTransparent(bg)) return { kind: "text", text: "transparent" };
        return { kind: "color", color: bg, text: bg };
      }
    },
    {
      id: "boxShadow", group: "colors", label: "Box-shadow", defaultEnabled: false,
      getValue: (_el, cs) => ({ kind: "text", text: cs.boxShadow })
    },

    // TYPOGRAPHY
    {
      id: "font", group: "typography", label: "Font", defaultEnabled: true,
      getValue: (_el, cs) => ({ kind: "text", text: cleanFontFamily(cs.fontFamily) })
    },
    {
      id: "fontSize", group: "typography", label: "Size", defaultEnabled: true,
      getValue: (_el, cs) => ({ kind: "text", text: cs.fontSize })
    },
    {
      id: "fontWeight", group: "typography", label: "Weight", defaultEnabled: true,
      getValue: (_el, cs) => ({ kind: "text", text: cs.fontWeight })
    },
    {
      id: "lineHeight", group: "typography", label: "Line-height", defaultEnabled: false,
      getValue: (_el, cs) => ({ kind: "text", text: cs.lineHeight })
    },
    {
      id: "letterSpacing", group: "typography", label: "Letter-spacing", defaultEnabled: false,
      getValue: (_el, cs) => ({ kind: "text", text: cs.letterSpacing })
    },
    {
      id: "textAlign", group: "typography", label: "Text-align", defaultEnabled: false,
      getValue: (_el, cs) => ({ kind: "text", text: cs.textAlign })
    },

    // CONTENT
    {
      id: "text", group: "content", label: "Text", defaultEnabled: true,
      getValue: (el) => {
        const copy = globalThis.ElementCopy;
        if (!copy || typeof copy.getDisplayText !== 'function') return null;
        const text = copy.getDisplayText(el);
        if (!text) return null;
        return { kind: "content", text };
      }
    }
  ];

  globalThis.InfoFields = {
    GROUPS,
    REGISTRY
  };
})();
