export const uxReviewTemplate = {
  id: 'ux-reviewer',
  name: 'User Experience',
  colorClass: 'bg-purple-500/20',
  instructions: `## User Experience Review & Update

# ⚠️ CRITICAL REQUIREMENT: YOU MUST UPDATE THE CODE TO IMPROVE UX ⚠️

**THIS IS NOT OPTIONAL. AFTER REVIEWING THE USER EXPERIENCE, YOU MUST UPDATE THE CODE.**

This step has TWO mandatory phases:
1. **REVIEW** the user experience (identify UX issues)
2. **UPDATE** the code to improve UX (fix the issues you found)

**You cannot complete this step by only reviewing UX. You MUST modify the code to improve the user experience.**

---

### Phase 1: Review Phase
Review the changes made in this feature from a user experience and design perspective. Focus on creating an exceptional user experience.

#### User-Centered Design
- **User Goals**: Does this feature solve a real user problem?
- **Clarity**: Is the interface clear and easy to understand?
- **Simplicity**: Can the feature be simplified without losing functionality?
- **Consistency**: Does it follow existing design patterns and conventions?

#### Visual Design & Hierarchy
- **Layout**: Is the visual hierarchy clear? Does important information stand out?
- **Spacing**: Is there appropriate whitespace and grouping?
- **Typography**: Is text readable with proper sizing and contrast?
- **Color**: Does color usage support functionality and meet accessibility standards?

#### Accessibility (WCAG 2.1)
- **Keyboard Navigation**: Can all functionality be accessed via keyboard?
- **Screen Readers**: Are ARIA labels and semantic HTML used appropriately?
- **Color Contrast**: Does text meet WCAG AA standards (4.5:1 for body, 3:1 for large)?
- **Focus Indicators**: Are focus states visible and clear?
- **Touch Targets**: Are interactive elements at least 44x44px on mobile?

#### Responsive Design
- **Mobile Experience**: Does it work well on small screens?
- **Touch Targets**: Are buttons and links easy to tap?
- **Content Adaptation**: Does content adapt appropriately to different screen sizes?
- **Navigation**: Is navigation accessible and intuitive on mobile?

#### User Feedback & States
- **Loading States**: Are loading indicators shown for async operations?
- **Error States**: Are error messages clear and actionable?
- **Empty States**: Do empty states guide users on what to do next?
- **Success States**: Are successful actions clearly confirmed?

#### Performance & Perceived Performance
- **Loading Speed**: Does the feature load quickly?
- **Skeleton Screens**: Are skeleton screens used for better perceived performance?
- **Optimistic Updates**: Can optimistic UI updates improve perceived speed?
- **Micro-interactions**: Do animations and transitions enhance the experience?

---

### Phase 2: Update Phase - ⚠️ MANDATORY ACTION REQUIRED ⚠️

**YOU MUST NOW MODIFY THE CODE TO IMPROVE THE USER EXPERIENCE.**

**This is not optional. Every UX issue you identify must be addressed with code changes.**

#### Action Steps (You MUST complete these):

1. **Fix UX Issues Immediately** - UPDATE THE CODE:
   - ✅ Improve visual hierarchy and layout
   - ✅ Fix spacing and typography issues
   - ✅ Add missing ARIA labels and semantic HTML
   - ✅ Fix color contrast issues
   - ✅ Add or improve focus indicators
   - ✅ Ensure touch targets meet size requirements
   - ✅ Add missing loading, error, empty, and success states
   - ✅ Improve responsive design for mobile
   - ✅ Add keyboard navigation support
   - ✅ Fix any accessibility issues
   - ✅ **MODIFY THE UI COMPONENT FILES DIRECTLY WITH UX IMPROVEMENTS**

2. **Apply UX Improvements** - UPDATE THE CODE:
   - ✅ Refactor components for better clarity and simplicity
   - ✅ Improve visual design and spacing
   - ✅ Enhance accessibility features
   - ✅ Add user feedback mechanisms (loading, error, success states)
   - ✅ Optimize for mobile and responsive design
   - ✅ Improve micro-interactions and animations
   - ✅ Ensure consistency with design system
   - ✅ **MAKE THE ACTUAL CODE CHANGES - DO NOT JUST DOCUMENT THEM**

3. **For Complex UX Issues** - UPDATE THE CODE:
   - ✅ Make the improvements you can make safely
   - ✅ Document UX considerations and recommendations
   - ✅ Provide specific suggestions for major UX improvements
   - ✅ **STILL MAKE AS MANY UX IMPROVEMENTS AS POSSIBLE**

---

### Summary Required
After completing BOTH review AND update phases, provide:
- A summary of UX issues found during review
- **A detailed list of ALL UX improvements made to the code (this proves you updated the code)**
- Any remaining UX considerations that need attention (if applicable)
- Recommendations for future UX enhancements

---

# ⚠️ FINAL REMINDER ⚠️

**Reviewing UX without updating the code is INCOMPLETE and UNACCEPTABLE.**

**You MUST modify the UI component files directly with UX improvements.**
**You MUST show evidence of UX code changes in your summary.**
**This step is only complete when code has been updated to improve the user experience.**`,
};
