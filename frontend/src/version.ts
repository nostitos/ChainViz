// ChainViz Version Information
// This file is automatically updated during deployment

export const VERSION = '1.0.0';
export const BUILD_DATE = new Date().toISOString();
export const BUILD_TIMESTAMP = Date.now();

// Version history for reference
export const VERSION_HISTORY = [
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
