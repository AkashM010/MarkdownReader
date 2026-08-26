/**
 * Mermaid module — initializes mermaid.js with theme-appropriate colors.
 */
import mermaid from 'mermaid';

const FONT_STACK = "'Space Grotesk', 'Segoe UI', system-ui, sans-serif";

export function updateMermaidTheme(theme) {
  if (theme === 'dark') {
    mermaid.initialize({
      suppressErrorRendering: true,
      theme: 'base',
      themeVariables: {
        background: 'transparent',
        primaryColor: '#134e4a',
        primaryBorderColor: '#2dd4bf',
        primaryTextColor: '#e8edf4',
        lineColor: '#5f6b7c',
        secondaryColor: '#1b2539',
        tertiaryColor: '#111828',
        fontFamily: FONT_STACK,
      },
    });
  } else {
    mermaid.initialize({
      suppressErrorRendering: true,
      theme: 'base',
      themeVariables: {
        background: 'transparent',
        primaryColor: '#ccfbf1',
        primaryBorderColor: '#0d9488',
        primaryTextColor: '#262b36',
        lineColor: '#99a0ab',
        secondaryColor: '#f3f0e9',
        tertiaryColor: '#ffffff',
        fontFamily: FONT_STACK,
      },
    });
  }
}
