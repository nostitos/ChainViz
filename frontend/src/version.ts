// ChainViz Version Information
// Update this manually when deploying a new version

export const VERSION = '1.0.1';
export const BUILD_DATE = '2025-11-03T07:19:00.000Z'; // Static build timestamp
export const BUILD_TIMESTAMP = 1730619540000; // Unix timestamp for the build

// Version history for reference
export const VERSION_HISTORY = [
  {
    version: '1.0.1',
    date: '2025-11-03',
    changes: [
      'Fixed critical memory leaks (2.6GB → stable 100MB)',
      'Simplified hop navigation (removed sliders, kept buttons only)',
      'Added right-click selection mode toggle',
      'Improved edge label visibility with text outlines',
      'Made Amount/Width value persist between sessions',
      'Logo now navigates to root',
      'Settings panel closes on backdrop click'
    ]
  },
  {
    version: '1.0.0',
    date: '2024-12-19',
    changes: ['Initial production release', 'Fixed production API URL detection', 'Added version tracking']
  }
];

// Get version info for display
export function getVersionInfo() {
  return {
    version: VERSION,
    buildDate: BUILD_DATE,
    buildTimestamp: BUILD_TIMESTAMP,
    formattedDate: new Date(BUILD_DATE).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    })
  };
}
