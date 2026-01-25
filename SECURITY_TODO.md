# Security Audit Findings - v0.13.0rc Branch

**Date:** $(date)  
**Audit Type:** Git diff security review against v0.13.0rc branch  
**Status:** ⚠️ Security vulnerabilities found - requires fixes before release

## Executive Summary

No intentionally malicious code was detected in the changes. However, several **critical security vulnerabilities** were identified that could allow command injection attacks. These must be fixed before release.

---

## 🔴 Critical Security Issues

### 1. Command Injection in Merge Handler

**File:** `apps/server/src/routes/worktree/routes/merge.ts`  
**Lines:** 43, 54, 65-66, 93  
**Severity:** CRITICAL

**Issue:**
User-controlled inputs (`branchName`, `mergeTo`, `options?.message`) are directly interpolated into shell commands without validation, allowing command injection attacks.

**Vulnerable Code:**

```typescript
// Line 43 - branchName not validated
await execAsync(`git rev-parse --verify ${branchName}`, { cwd: projectPath });

// Line 54 - mergeTo not validated
await execAsync(`git rev-parse --verify ${mergeTo}`, { cwd: projectPath });

// Lines 65-66 - branchName and message not validated
const mergeCmd = options?.squash
  ? `git merge --squash ${branchName}`
  : `git merge ${branchName} -m "${options?.message || `Merge ${branchName} into ${mergeTo}`}"`;

// Line 93 - message not sanitized
await execAsync(`git commit -m "${options?.message || `Merge ${branchName} (squash)`}"`, {
  cwd: projectPath,
});
```

**Attack Vector:**
An attacker could inject shell commands via branch names or commit messages:

- Branch name: `main; rm -rf /`
- Commit message: `"; malicious_command; "`

**Fix Required:**

1. Validate `branchName` and `mergeTo` using `isValidBranchName()` before use
2. Sanitize commit messages or use `execGitCommand` with proper escaping
3. Replace `execAsync` template literals with `execGitCommand` array-based calls

**Note:** `isValidBranchName` is imported but only used AFTER deletion (line 119), not before execAsync calls.

---

### 2. Command Injection in Push Handler

**File:** `apps/server/src/routes/worktree/routes/push.ts`  
**Lines:** 44, 49  
**Severity:** CRITICAL

**Issue:**
User-controlled `remote` parameter and `branchName` are directly interpolated into shell commands without validation.

**Vulnerable Code:**

```typescript
// Line 38 - remote defaults to 'origin' but not validated
const targetRemote = remote || 'origin';

// Lines 44, 49 - targetRemote and branchName not validated
await execAsync(`git push -u ${targetRemote} ${branchName} ${forceFlag}`, {
  cwd: worktreePath,
});
await execAsync(`git push --set-upstream ${targetRemote} ${branchName} ${forceFlag}`, {
  cwd: worktreePath,
});
```

**Attack Vector:**
An attacker could inject commands via the remote name:

- Remote: `origin; malicious_command; #`

**Fix Required:**

1. Validate `targetRemote` parameter (alphanumeric + `-`, `_` only)
2. Validate `branchName` before use (even though it comes from git output)
3. Use `execGitCommand` with array arguments instead of template literals

---

### 3. Unsafe Environment Variable Export in Shell Script

**File:** `start-automaker.sh`  
**Lines:** 5068, 5085  
**Severity:** CRITICAL

**Issue:**
Unsafe parsing and export of `.env` file contents using `xargs` without proper handling of special characters.

**Vulnerable Code:**

```bash
export $(grep -v '^#' .env | xargs)
```

**Attack Vector:**
If `.env` file contains malicious content with spaces, special characters, or code, it could be executed:

- `.env` entry: `VAR="value; malicious_command"`
- Could lead to code execution during startup

**Fix Required:**
Replace with safer parsing method:

```bash
# Safer approach
set -a
source <(grep -v '^#' .env | sed 's/^/export /')
set +a

# Or even safer - validate each line
while IFS= read -r line; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "$line" ]] && continue
  if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
    export "${BASH_REMATCH[1]}"="${BASH_REMATCH[2]}"
  fi
done < .env
```

---

## 🟡 Moderate Security Concerns

### 4. Inconsistent Use of Secure Command Execution

**Issue:**
The codebase has `execGitCommand()` function available (which uses array arguments and is safer), but it's not consistently used. Some places still use `execAsync` with template literals.

**Files Affected:**

- `apps/server/src/routes/worktree/routes/merge.ts`
- `apps/server/src/routes/worktree/routes/push.ts`

**Recommendation:**

- Audit all `execAsync` calls with template literals
- Replace with `execGitCommand` where possible
- Document when `execAsync` is acceptable (only with fully validated inputs)

---

### 5. Missing Input Validation

**Issues:**

1. `targetRemote` in `push.ts` defaults to 'origin' but isn't validated
2. Commit messages in `merge.ts` aren't sanitized before use in shell commands
3. `worktreePath` validation relies on middleware but should be double-checked

**Recommendation:**

- Add validation functions for remote names
- Sanitize commit messages (remove shell metacharacters)
- Add defensive validation even when middleware exists

---

## ✅ Positive Security Findings

1. **No Hardcoded Credentials:** No API keys, passwords, or tokens found in the diff
2. **No Data Exfiltration:** No suspicious network requests or data transmission patterns
3. **No Backdoors:** No hidden functionality or unauthorized access patterns detected
4. **Safe Command Execution:** `execGitCommand` function properly uses array arguments in some places
5. **Environment Variable Handling:** `init-script-service.ts` properly sanitizes environment variables (lines 194-220)

---

## 📋 Action Items

### Immediate (Before Release)

- [ ] **Fix command injection in `merge.ts`**
  - [ ] Validate `branchName` with `isValidBranchName()` before line 43
  - [ ] Validate `mergeTo` with `isValidBranchName()` before line 54
  - [ ] Sanitize commit messages or use `execGitCommand` for merge commands
  - [ ] Replace `execAsync` template literals with `execGitCommand` array calls

- [ ] **Fix command injection in `push.ts`**
  - [ ] Add validation function for remote names
  - [ ] Validate `targetRemote` before use
  - [ ] Validate `branchName` before use (defensive programming)
  - [ ] Replace `execAsync` template literals with `execGitCommand`

- [ ] **Fix shell script security issue**
  - [ ] Replace unsafe `export $(grep ... | xargs)` with safer parsing
  - [ ] Add validation for `.env` file contents
  - [ ] Test with edge cases (spaces, special chars, quotes)

### Short-term (Next Sprint)

- [ ] **Audit all `execAsync` calls**
  - [ ] Create inventory of all `execAsync` calls with template literals
  - [ ] Replace with `execGitCommand` where possible
  - [ ] Document exceptions and why they're safe

- [ ] **Add input validation utilities**
  - [ ] Create `isValidRemoteName()` function
  - [ ] Create `sanitizeCommitMessage()` function
  - [ ] Add validation for all user-controlled inputs

- [ ] **Security testing**
  - [ ] Add unit tests for command injection prevention
  - [ ] Add integration tests with malicious inputs
  - [ ] Test shell script with malicious `.env` files

### Long-term (Security Hardening)

- [ ] **Code review process**
  - [ ] Add security checklist for PR reviews
  - [ ] Require security review for shell command execution changes
  - [ ] Add automated security scanning

- [ ] **Documentation**
  - [ ] Document secure coding practices for shell commands
  - [ ] Create security guidelines for contributors
  - [ ] Add security section to CONTRIBUTING.md

---

## 🔍 Testing Recommendations

### Command Injection Tests

```typescript
// Test cases for merge.ts
describe('merge handler security', () => {
  it('should reject branch names with shell metacharacters', () => {
    // Test: branchName = "main; rm -rf /"
    // Expected: Validation error, command not executed
  });

  it('should sanitize commit messages', () => {
    // Test: message = '"; malicious_command; "'
    // Expected: Sanitized or rejected
  });
});

// Test cases for push.ts
describe('push handler security', () => {
  it('should reject remote names with shell metacharacters', () => {
    // Test: remote = "origin; malicious_command; #"
    // Expected: Validation error, command not executed
  });
});
```

### Shell Script Tests

```bash
# Test with malicious .env content
echo 'VAR="value; echo PWNED"' > test.env
# Expected: Should not execute the command

# Test with spaces in values
echo 'VAR="value with spaces"' > test.env
# Expected: Should handle correctly

# Test with special characters
echo 'VAR="value\$with\$dollars"' > test.env
# Expected: Should handle correctly
```

---

## 📚 References

- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
- [Node.js Child Process Security](https://nodejs.org/api/child_process.html#child_process_security_concerns)
- [Shell Script Security Best Practices](https://mywiki.wooledge.org/BashGuide/Practices)

---

## Notes

- All findings are based on code diff analysis
- No runtime testing was performed
- Assumes attacker has access to API endpoints (authenticated or unauthenticated)
- Fixes should be tested thoroughly before deployment

---

**Last Updated:** $(date)  
**Next Review:** After fixes are implemented
