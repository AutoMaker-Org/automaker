export const securityReviewTemplate = {
  id: 'security-review',
  name: 'Security Review',
  colorClass: 'bg-red-500/20',
  instructions: `## Security Review & Update

# ⚠️ CRITICAL REQUIREMENT: YOU MUST UPDATE THE CODE TO FIX SECURITY ISSUES ⚠️

**THIS IS NOT OPTIONAL. AFTER REVIEWING FOR SECURITY ISSUES, YOU MUST FIX THEM IN THE CODE.**

This step has TWO mandatory phases:
1. **REVIEW** the code for security vulnerabilities (identify issues)
2. **UPDATE** the code to fix vulnerabilities (secure the code)

**You cannot complete this step by only identifying security issues. You MUST modify the code to fix them.**

**Security vulnerabilities left unfixed are unacceptable. You must address them with code changes.**

---

### Phase 1: Review Phase
Perform a comprehensive security audit of the changes made in this feature. Check for vulnerabilities in the following areas:

#### Input Validation & Sanitization
- Verify all user inputs are properly validated and sanitized
- Check for SQL injection vulnerabilities
- Check for XSS (Cross-Site Scripting) vulnerabilities
- Ensure proper encoding of output data

#### Authentication & Authorization
- Verify authentication checks are in place where needed
- Ensure authorization logic correctly restricts access
- Check for privilege escalation vulnerabilities
- Verify session management is secure

#### Data Protection
- Ensure sensitive data is not logged or exposed
- Check that secrets/credentials are not hardcoded
- Verify proper encryption is used for sensitive data
- Check for secure transmission of data (HTTPS, etc.)

#### Common Vulnerabilities (OWASP Top 10)
- Injection flaws
- Broken authentication
- Sensitive data exposure
- XML External Entities (XXE)
- Broken access control
- Security misconfiguration
- Cross-Site Scripting (XSS)
- Insecure deserialization
- Using components with known vulnerabilities
- Insufficient logging & monitoring

---

### Phase 2: Update Phase - ⚠️ MANDATORY ACTION REQUIRED ⚠️

**YOU MUST NOW MODIFY THE CODE TO FIX ALL SECURITY VULNERABILITIES.**

**This is not optional. Every security issue you identify must be fixed with code changes.**

**Security vulnerabilities cannot be left unfixed. You must address them immediately.**

#### Action Steps (You MUST complete these):

1. **Fix Vulnerabilities Immediately** - UPDATE THE CODE:
   - ✅ Add input validation and sanitization where missing
   - ✅ Fix SQL injection vulnerabilities by using parameterized queries
   - ✅ Fix XSS vulnerabilities by properly encoding output
   - ✅ Add authentication/authorization checks where needed
   - ✅ Remove hardcoded secrets and credentials
   - ✅ Implement proper encryption for sensitive data
   - ✅ Fix broken access control
   - ✅ Add security headers and configurations
   - ✅ Fix any other security vulnerabilities you find
   - ✅ **MODIFY THE SOURCE FILES DIRECTLY TO FIX SECURITY ISSUES**

2. **Apply Security Best Practices** - UPDATE THE CODE:
   - ✅ Implement proper input validation on all user inputs
   - ✅ Ensure all outputs are properly encoded
   - ✅ Add authentication checks to protected routes/endpoints
   - ✅ Implement proper authorization logic
   - ✅ Remove or secure any exposed sensitive data
   - ✅ Add security logging and monitoring
   - ✅ Update dependencies with known vulnerabilities
   - ✅ **MAKE THE ACTUAL CODE CHANGES - DO NOT JUST DOCUMENT THEM**

3. **For Complex Security Issues** - UPDATE THE CODE:
   - ✅ Fix what you can fix safely
   - ✅ Document critical security issues with severity levels
   - ✅ Provide specific remediation steps for complex issues
   - ✅ Add security-related comments explaining protections in place
   - ✅ **STILL MAKE AS MANY SECURITY FIXES AS POSSIBLE**

---

### Summary Required
After completing BOTH review AND update phases, provide:
- A security assessment summary of vulnerabilities found
- **A detailed list of ALL security fixes applied to the code (this proves you updated the code)**
- Any remaining security concerns that need attention (if applicable)
- Severity levels for any unfixed issues

---

# ⚠️ FINAL REMINDER ⚠️

**Reviewing security without fixing vulnerabilities is INCOMPLETE, UNACCEPTABLE, and DANGEROUS.**

**You MUST modify the code files directly to fix security issues.**
**You MUST show evidence of security fixes in your summary.**
**This step is only complete when security vulnerabilities have been fixed in the code.**
**Security issues cannot be left as documentation - they must be fixed.**`,
};
