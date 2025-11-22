# Drag & Drop File Upload Design

**Date:** 2025-11-22
**Status:** Approved
**Author:** Claude (with user validation)

## Overview

Add drag & drop file upload functionality to TelicLens to improve file access reliability on macOS. This addresses permission issues with the browser File API when selecting files from restricted directories (iCloud-synced folders, system-protected directories).

## Problem Statement

Current file upload uses browser's `<input type="file">` which triggers macOS permission errors for files in:
- iCloud-synced folders (Desktop, Documents)
- System-protected directories
- Files locked by other applications

Drag & drop provides better permission handling by the browser for the same files.

## Design Decisions

### User Interface

**Drop Zone Location:** Dedicated drop zone box in the Files section (bottom of sidebar)

**Visual Feedback:** Border highlight + overlay
- Default (no files): Large centered prompt with icon and "Drag files here" text
- Default (with files): Normal file list view
- Drag hover: Blue glowing border + semi-transparent overlay "Drop to upload"
- Processing: Loading spinner overlay with "Processing files..." text

**Interaction Model:** Replace existing file input button entirely with drag & drop zone

### Technical Architecture

**Component Structure:**
- Modify `Sidebar.tsx` to add drag event handlers to Files section (lines 197-226)
- Replace upload button (lines 200-209) with drop zone UI
- Reuse existing `onFileUpload` callback interface

**State Management:**
```typescript
const [isDragging, setIsDragging] = useState(false);
const [dragCounter, setDragCounter] = useState(0); // Handle nested elements
```

**Event Flow:**
1. `onDragEnter` → increment dragCounter, set isDragging=true
2. `onDragOver` → preventDefault() to enable drop
3. `onDragLeave` → decrement dragCounter, if 0 set isDragging=false
4. `onDrop` → extract e.dataTransfer.files, process files

**File Processing:**
- Extract existing file processing from `App.tsx` handleFileUpload (lines 147-174)
- Create shared `processFiles(fileList: File[])` helper in `App.tsx`
- Both drag-drop and future fallback input use same logic
- Maintains existing validation: file extensions, empty file checks, error alerts

### Error Handling

**Validation:**
- Invalid file types: Alert with supported extensions list
- Empty files: Skip with console warning
- Directory drops: Filter to actual files only
- No valid files: "No valid code files found" message

**Edge Cases:**
- Multiple rapid drops: Disable drop zone during processing (isDragging prevents new drops)
- Mixed files: Process valid, alert about invalid
- Large batches: `Promise.all` with progress feedback

**User Feedback:**
- Success: Auto-select last file, switch to CODE view
- Failure: Alert with filename and error reason
- In-progress: Semi-transparent overlay

### Accessibility

- Hidden file input maintained as keyboard-accessible fallback
- ARIA labels for drop zone states
- Screen reader announcements for drag state changes
- Clear visual indicators (not color-only)

## Implementation Plan

### Phase 1: Refactor File Processing
- Extract file reading logic from `App.tsx` handleFileUpload into separate helper
- Test existing upload still works

### Phase 2: Add Drag State to Sidebar
- Add `isDragging` and `dragCounter` state to Sidebar component
- Add drag event handlers (onDragEnter, onDragOver, onDragLeave, onDrop)
- Wire up to call existing `onFileUpload` with synthetic event

### Phase 3: Update UI
- Replace upload button with drop zone component
- Add conditional styling based on `isDragging` and `files.length`
- Add overlay with border highlight animation

### Phase 4: Testing
- Test valid file drops
- Test invalid file types
- Test empty files
- Test rapid successive drops
- Test with/without existing files
- Test accessibility (keyboard navigation to fallback)

## Files Modified

- `components/Sidebar.tsx` - Add drag handlers, update Files section UI (lines 197-226)
- `App.tsx` - Extract file processing helper (lines 147-174)

## Success Metrics

- Users can upload files from iCloud/protected directories without permission errors
- Visual feedback clearly indicates drop zone and drag states
- No regression in existing file upload validation
- Accessible via keyboard (fallback input)

## Future Enhancements (Out of Scope)

- Drag & drop entire folders
- Progress bar for large file batches
- File size limits with chunked processing
- Drag files directly onto graph to associate with nodes
