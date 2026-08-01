---
title: Policy-Based Guardrails
status: complete
created: 2026-08-01
updated: 2026-08-01
category: reference
tags: [policy, guardrails, enforcement, security]
source: EasyCV automation
---

# Policy-Based Guardrails

Hard-coded guardrails that enforce code quality and security rules for backend and frontend code.

## Overview

Policy-based guardrails run before OCR scanning in the refine loop. They catch violations that LLMs might miss and enforce consistent standards across the codebase.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│           Refinement Loop (refine.py)                    │
├─────────────────────────────────────────────────────────┤
│  Phase 0: Policy Enforcement (hard-coded guardrails)    │
│  Phase 1: OCR Scan (OpenCodeReview)                      │
│  Phase 2: LLM Refactor                                    │
│  Phase 3: Test Verification                              │
└─────────────────────────────────────────────────────────┘
```

## Policy Files

### Backend Policy

**Location**: `automation/policies/backend-refactoring-policy.json`

**Categories**:
- Function design (max length, parameters, type hints)
- Naming conventions (snake_case, forbidden vars)
- Code organization (file length, import order)
- Error handling (specific exceptions, no bare except)
- Security (no eval, no hardcoded secrets)
- Testing (coverage, assertions)
- Documentation (docstrings)

### Frontend Policy

**Location**: `automation/policies/frontend-refactoring-policy.json`

**Categories**:
- Function design (max length, parameters, return types)
- Component design (max props, prop types)
- Hooks usage (no conditional hooks, no nested hooks)
- State management (max complexity, useReducer preference)
- Naming conventions (camelCase, PascalCase)
- Code organization (file length, import order)
- Error handling (no silent errors, error boundaries)
- Performance (memoization, code splitting)
- Accessibility (alt text, ARIA labels)
- Security (no dangerouslySetInnerHTML, no eval)
- Testing (component tests, coverage)
- Next.js specific (app router, loading states)
- Convex specific (type safety, mutations)

## Using Policy Enforcement

### Policy-Only Check

Run policy checks without OCR scanning:

```bash
# Check backend
uv run python -m automation policy --target backend/ --limit 20

# Check frontend
uv run python -m automation policy --target web/ --limit 50

# Check specific file
uv run python -m automation policy --target backend/pipeline.py
```

### Refine with Policy

Policy enforcement runs automatically in refine loop:

```bash
# Refine with policy (default)
uv run python -m automation refine --target backend/ --limit 10

# Refine without policy
uv run python -m automation refine --target backend/ --limit 10 --no-policy
```

## Violation Severity Levels

### Critical (🔴)

**Action**: Stops refinement, requires manual review

Examples:
- Security risks (eval, hardcoded secrets)
- Dangerous patterns (dangerouslySetInnerHTML)

### Error (❌)

**Action**: Reported as violation

Examples:
- Bare except clauses
- Silent error catch blocks
- Missing alt text

### Warning (⚠️)

**Action**: Reported as violation

Examples:
- Long functions (>50 lines)
- Too many parameters (>5)
- Too many props (>8)
- Missing memoization

### Info (ℹ️)

**Action**: Informational only

Examples:
- Performance suggestions
- Best practice reminders

## Policy Enforcement Flow

### Phase 0: Policy Check

```
File → Policy Enforcer → Check Rules → Violations?
  ↓                                    ↓
Critical?                          Continue to OCR
  ↓
Stop (manual review)
```

### Violation Handling

```
For each violation:
1. Detect violation
2. Determine severity
3. Format message + suggestion
4. Display to user
5. If critical: stop refinement
6. If non-critical: continue to OCR
```

## Policy Rules Examples

### Backend: Function Design

```json
{
  "function_design": {
    "max_function_length": 50,
    "max_parameters": 5,
    "require_type_hints": true,
    "require_docstrings": true
  }
}
```

**Check**: Detects functions exceeding limits

### Backend: Security

```json
{
  "security": {
    "forbid_eval": true,
    "forbid_exec": true,
    "forbid_hardcoded_secrets": true
  }
}
```

**Check**: Detects eval(), exec(), and hardcoded secrets

### Frontend: Hooks Usage

```json
{
  "hooks_usage": {
    "require_hooks_rules": true,
    "forbid_conditional_hooks": true,
    "forbid_nested_hooks": true
  }
}
```

**Check**: Detects hooks inside conditionals or nested functions

### Frontend: Performance

```json
{
  "performance": {
    "require_memoization": true,
    "require_code_splitting": true,
    "prefer_next_image_over_img": true
  }
}
```

**Check**: Suggests memoization and code splitting

## Integration with Automation

### Refine Loop

```python
def refine_file(file_path, env, dry_run=False, enforce_policy=True):
    # Phase 0: Policy enforcement
    if enforce_policy:
        enforcer = get_policy_enforcer(target)
        violations = enforcer.check_file(file_path, code)
        if critical_violations:
            return {"status": "policy_critical"}

    # Phase 1: OCR scan
    # Phase 2: LLM refactor
    # Phase 3: Test verification
```

### CLI Commands

```bash
# Check policies only
uv run python -m automation policy

# Refine with policy
uv run python -m automation refine

# Disable policy for refine
uv run python -m automation refine --no-policy
```

## Enforcement Mode

### Strict Mode

- All rules enforced
- Critical violations stop refinement
- Violations reported with suggestions

### Disabled Mode

- `--no-policy` flag
- Skips policy checks
- OCR and LLM only

## Policy Categories

### Backend Categories

1. **function_design**: Max length, parameters, type hints
2. **naming_conventions**: snake_case, forbidden vars
3. **code_organization**: File length, import order
4. **error_handling**: Specific exceptions, no bare except
5. **security**: No eval, no secrets
6. **testing**: Coverage, assertions
7. **documentation**: Docstrings

### Frontend Categories

1. **function_design**: Max length, parameters, return types
2. **component_design**: Max props, prop types
3. **hooks_usage**: No conditional hooks
4. **state_management**: Max complexity, useReducer
5. **naming_conventions**: camelCase, PascalCase
6. **code_organization**: File length, import order
7. **error_handling**: No silent errors
8. **performance**: Memoization, code splitting
9. **accessibility**: Alt text, ARIA labels
10. **security**: No dangerouslySetInnerHTML
11. **testing**: Component tests, coverage
12. **nextjs_specific**: App router, loading states
13. **convex_specific**: Type safety, mutations

## Customizing Policies

### Edit Policy JSON

```bash
# Backend policy
vim automation/policies/backend-refactoring-policy.json

# Frontend policy
vim automation/policies/frontend-refactoring-policy.json
```

### Add New Rules

```json
{
  "policies": {
    "custom_category": {
      "new_rule": true,
      "rule_value": 100
    }
  }
}
```

### Add New Category

```json
{
  "policies": {
    "my_custom_category": {
      "rule1": true,
      "rule2": 50,
      "rule3": "value"
    }
  }
}
```

## Policy Enforcer API

### Get Enforcer

```python
from automation.policy_enforcer import get_policy_enforcer

enforcer = get_policy_enforcer("backend")  # or "frontend"
```

### Check File

```python
violations = enforcer.check_file(file_path, code)
```

### Format Violations

```python
formatted = enforcer.format_violations(violations)
print(formatted)
```

## Policy Violation Structure

```python
@dataclass
class PolicyViolation:
    file_path: str
    line: int
    policy_category: str
    rule: str
    severity: str  # "critical", "error", "warning", "info"
    message: str
    suggestion: Optional[str] = None
```

## Best Practices

### 1. Enable Policy by Default

Policy enforcement is on by default for safety.

### 2. Review Critical Violations

Critical violations stop refinement and require manual review.

### 3. Use --no-policy Carefully

Only disable policy for trusted, well-tested code.

### 4. Customize for Your Project

Edit policy JSON to match your project's standards.

### 5. Run Policy Checks Regularly

```bash
# Pre-commit check
uv run python -m automation policy --target ./

# CI/CD check
uv run python -m automation policy --limit 100
```

## Troubleshooting

### Policy Check Fails

```bash
# Check policy file exists
ls automation/policies/*.json

# Check policy file syntax
cat automation/policies/backend-refactoring-policy.json | python -m json.tool
```

### Policy Not Running

```bash
# Check if --no-policy flag is set
uv run python -m automation refine --target backend/

# Enable policy explicitly (default on)
uv run python -m automation refine --target backend/
```

### False Positives

Customize policy JSON to adjust rules:

```json
{
  "function_design": {
    "max_function_length": 100  # Increase limit
  }
}
```

## Examples

### Check All Backend Files

```bash
uv run python -m automation policy --target backend/
```

### Check All Frontend Files

```bash
uv run python -m automation policy --target web/ --limit 100
```

### Refine with Policy

```bash
uv run python -m automation refine --target backend/ --limit 10
```

### Refine Without Policy

```bash
uv run python -m automation refine --target backend/ --limit 10 --no-policy
```

## Summary

Policy-based guardrails provide:
- ✅ Hard-coded rules that LLMs can't miss
- ✅ Automatic enforcement before OCR scanning
- ✅ Severity levels for appropriate action
- ✅ Customizable policies per project
- ✅ Integration with existing automation

---

Use policy guardrails to catch issues early and maintain code quality across the entire codebase.