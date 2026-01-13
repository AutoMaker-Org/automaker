/**
 * "Simplify" Enhancement Mode
 * Makes verbose descriptions concise and focused.
 */

import type { EnhancementExample } from '@automaker/types';

/**
 * System prompt for the "simplify" enhancement mode.
 * Makes verbose descriptions concise and focused.
 */
export const SIMPLIFY_SYSTEM_PROMPT = `You are an expert editor who excels at making verbose text concise without losing meaning.

Your task is to simplify a task description while preserving essential information:

1. IDENTIFY the core message:
   - Extract the primary goal or requirement
   - Note truly essential details
   - Separate nice-to-have from must-have information

2. ELIMINATE redundancy:
   - Remove repeated information
   - Cut unnecessary qualifiers and hedging language
   - Remove filler words and phrases

3. CONSOLIDATE related points:
   - Merge overlapping requirements
   - Group related items together
   - Use concise language

4. PRESERVE critical details:
   - Keep specific technical requirements
   - Retain important constraints
   - Maintain actionable specifics

Output ONLY the simplified description. Aim for 30-50% reduction in length while keeping all essential information. Do not explain your changes.`;

/**
 * Few-shot examples for the "simplify" enhancement mode
 */
export const SIMPLIFY_EXAMPLES: EnhancementExample[] = [
  {
    input: `We need to implement a feature that would allow our users to be able to export their data in various different formats. The formats we are thinking about supporting include CSV which is commonly used for spreadsheet applications, and also JSON which is good for developers, and possibly PDF for people who want a printable version. The user should be able to go somewhere in the UI and select which format they want and then download their data in that format. We should probably also show some kind of progress indicator while the export is happening since it might take a while for large datasets.`,
    output: `Add Data Export Feature

Allow users to export their data in CSV, JSON, or PDF format.

Requirements:
- Add export button/menu in the UI
- Support three formats: CSV (spreadsheets), JSON (developers), PDF (printing)
- Show progress indicator during export
- Handle large datasets gracefully`,
  },
  {
    input: `The current notification system is not working very well and users are complaining about it. Sometimes they don't receive notifications at all, and other times they receive too many notifications and feel overwhelmed. We also have had reports that the notifications are not appearing correctly on mobile devices. Additionally, some users have requested the ability to customize which types of notifications they receive. We should look into all of these issues and make the notification system work better overall.`,
    output: `Fix and Improve Notification System

Address reliability issues and add user controls for notifications.

Issues to fix:
- Missing notifications (delivery reliability)
- Notification overload (implement batching/digest)
- Mobile display problems

Enhancements:
- Add notification preferences (per-type controls)
- Test across devices and platforms`,
  },
];

/**
 * Description of what this enhancement mode does
 */
export const SIMPLIFY_DESCRIPTION = 'Make verbose descriptions concise and focused';
