# GitHub Issue Fix Command

Fetch a GitHub issue by number, verify it's a real issue, and fix it if valid.

## Usage

This command accepts a GitHub issue number as input (e.g., `123`).

## Instructions

1. **Get the issue number from the user**
   - The issue number should be provided as an argument to this command
   - If no number is provided, ask the user for it

2. **Fetch the GitHub issue**
   - Determine the current project path (check if there's a current project context)
   - Verify the project has a GitHub remote:
     ```bash
     git remote get-url origin
     ```
   - Fetch the issue details using GitHub CLI:
     ```bash
     gh issue view <ISSUE_NUMBER> --json number,title,state,author,createdAt,labels,url,body,assignees
     ```
   - If the command fails, report the error and stop

3. **Verify the issue is real and valid**
   - Check that the issue exists (not 404)
   - Check the issue state:
     - If **closed**: Inform the user and ask if they still want to proceed
     - If **open**: Proceed with validation
   - Review the issue content:
     - Read the title and body to understand what needs to be fixed
     - Check labels for context (bug, enhancement, etc.)
     - Note any assignees or linked PRs

4. **Validate the issue**
   - Determine if this is a legitimate issue that needs fixing:
     - Is the description clear and actionable?
     - Does it describe a real problem or feature request?
     - Are there any obvious signs it's spam or invalid?
   - If the issue seems invalid or unclear:
     - Report findings to the user
     - Ask if they want to proceed anyway
     - Stop if user confirms it's not valid

5. **If the issue is valid, proceed to fix it**
   - Analyze what needs to be done based on the issue description
   - Check the current codebase state:
     - Run relevant tests to see current behavior
     - Check if the issue is already fixed
     - Look for related code that might need changes
   - Implement the fix:
     - Make necessary code changes
     - Update or add tests as needed
     - Ensure the fix addresses the issue description
   - Verify the fix:
     - Run tests to ensure nothing broke
     - If possible, manually verify the fix addresses the issue

6. **Report summary**
   - Issue number and title
   - Issue state (open/closed)
   - Whether the issue was validated as real
   - What was fixed (if anything)
   - Any tests that were updated or added
   - Next steps (if any)

## Error Handling

- If GitHub CLI (`gh`) is not installed or authenticated, report error and stop
- If the project doesn't have a GitHub remote, report error and stop
- If the issue number doesn't exist, report error and stop
- If the issue is unclear or invalid, report findings and ask user before proceeding
