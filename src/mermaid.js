/**
 * Mermaid module — initializes mermaid.js with theme-appropriate colors.
 *
 * Mermaid bakes colours into each SVG at render time, so these values are a
 * hand-kept mirror of the Deep Glass palette in style.css rather than live
 * custom properties. Update both together.
 */
import mermaid from 'mermaid';

const FONT_STACK = "'Inter', 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif";

export function updateMermaidTheme(theme) {
  if (theme === 'dark') {
    mermaid.initialize({
      suppressErrorRendering: true,
      theme: 'base',
      themeVariables: {
        background: 'transparent',
        primaryColor: '#0e3a46',        /* node fill — cyan, deep      */
        primaryBorderColor: '#22d3ee',  /* --accent                    */
        primaryTextColor: '#f3f7fc',    /* --text-primary              */
        lineColor: '#8698ae',           /* --text-muted                */
        secondaryColor: '#1c1e26',      /* --surface-3 composited      */
        tertiaryColor: '#10121a',       /* --surface-1 composited      */
        fontFamily: FONT_STACK,
      },
    });
  } else {
    mermaid.initialize({
      suppressErrorRendering: true,
      theme: 'base',
      themeVariables: {
        background: 'transparent',
        primaryColor: '#cffafe',        /* node fill — cyan, pale      */
        primaryBorderColor: '#0e7490',  /* --accent                    */
        primaryTextColor: '#101828',    /* --text-primary              */
        lineColor: '#8b97a6',
        secondaryColor: '#f5f7fa',      /* --surface-2 composited      */
        tertiaryColor: '#ffffff',
        fontFamily: FONT_STACK,
      },
    });
  }
}
