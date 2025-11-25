#!/usr/bin/env python3
import sys

# Read the file
with open('/Users/t/Documents/vibbbing/ChainViz/frontend/src/App.tsx', 'r') as f:
    lines = f.readlines()

# Find the line with "About Panel" and insert after the closing )}\n
insert_after_line =None
for i, line in enumerate(lines):
    if '{/* About Panel */}' in line:
        # Find the closing )} after this
        for j in range(i, min(i + 10, len(lines))):
            if lines[j].strip() == '})':
                insert_after_line = j
                break
        break

if insert_after_line is None:
    print("Error: Could not find insertion point")
    sys.exit(1)

# Prepare the modal code
modal_code = """
      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        message={confirmationModal.message}
        onConfirm={confirmationModal.onConfirm}
        onCancel={() => setConfirmationModal({ isOpen: false, message: '', onConfirm: () => {} })}
      />
"""

# Insert the modal code
lines.insert(insert_after_line + 1, modal_code)

# Write back
with open('/Users/t/Documents/vibbbing/ChainViz/frontend/src/App.tsx', 'w') as f:
    f.writelines(lines)

print("Successfully inserted ConfirmationModal component!")
