/**
 * Mermaid module — initializes mermaid.js with theme-appropriate colors.
 */
import mermaid from 'mermaid';

export function updateMermaidTheme(theme) {
  if (theme === 'dark') {
    mermaid.initialize({
      theme: 'base',
      themeVariables: {
        background: 'transparent',
        primaryColor: '#818cf8',
        primaryBorderColor: '#6366f1',
        primaryTextColor: '#e2e8f0',
        lineColor: '#64748b',
        secondaryColor: '#1e293b',
        tertiaryColor: '#0f172a',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
    });
  } else {
    mermaid.initialize({
      theme: 'base',
      themeVariables: {
        background: 'transparent',
        primaryColor: '#4f46e5',
        primaryBorderColor: '#4338ca',
        primaryTextColor: '#1e293b',
        lineColor: '#94a3b8',
        secondaryColor: '#f1f5f9',
        tertiaryColor: '#ffffff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
    });
  }
}
