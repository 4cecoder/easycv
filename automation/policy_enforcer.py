"""
Policy-based refactoring guardrails for EasyCV automation.

Enforces hard-coded rules for backend and frontend code quality.
"""

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import re


@dataclass
class PolicyViolation:
    """Represents a policy violation found in code."""

    file_path: str
    line: int
    policy_category: str
    rule: str
    severity: str
    message: str
    suggestion: Optional[str] = None


class PolicyEnforcer:
    """Enforces refactoring policies on code."""

    def __init__(self, policy_path: Path):
        self.policy_path = policy_path
        self.policy = self._load_policy()
        self.target = self.policy.get("target", "unknown")
        self.language = self.policy.get("language", "python")
        self.policies = self.policy.get("policies", {})

    def _load_policy(self) -> Dict:
        """Load policy JSON file."""
        if not self.policy_path.exists():
            return {}
        with open(self.policy_path) as f:
            return json.load(f)

    def check_file(self, file_path: Path, code: str) -> List[PolicyViolation]:
        """Check a file against all policies."""
        violations = []
        lines = code.split("\n")

        for category, rules in self.policies.items():
            category_violations = self._check_category(category, rules, file_path, lines)
            violations.extend(category_violations)

        return violations

    def _check_category(
        self, category: str, rules: Dict, file_path: Path, lines: List[str]
    ) -> List[PolicyViolation]:
        """Check a specific policy category."""
        violations = []

        if category == "function_design":
            violations.extend(self._check_function_design(rules, file_path, lines))
        elif category == "naming_conventions":
            violations.extend(self._check_naming_conventions(rules, file_path, lines))
        elif category == "code_organization":
            violations.extend(self._check_code_organization(rules, file_path, lines))
        elif category == "error_handling":
            violations.extend(self._check_error_handling(rules, file_path, lines))
        elif category == "security":
            violations.extend(self._check_security(rules, file_path, lines))
        elif category == "testing":
            violations.extend(self._check_testing(rules, file_path, lines))
        elif category == "documentation":
            violations.extend(self._check_documentation(rules, file_path, lines))
        elif category == "component_design":
            violations.extend(self._check_component_design(rules, file_path, lines))
        elif category == "hooks_usage":
            violations.extend(self._check_hooks_usage(rules, file_path, lines))
        elif category == "state_management":
            violations.extend(self._check_state_management(rules, file_path, lines))
        elif category == "performance":
            violations.extend(self._check_performance(rules, file_path, lines))
        elif category == "accessibility":
            violations.extend(self._check_accessibility(rules, file_path, lines))

        return violations

    def _check_function_design(
        self, rules: Dict, file_path: Path, lines: List[str]
    ) -> List[PolicyViolation]:
        """Check function design rules."""
        violations = []
        max_length = rules.get("max_function_length", 50)
        max_params = rules.get("max_parameters", 5)

        # Find functions and check length
        if self.language == "python":
            func_pattern = re.compile(r"^def (\w+)\(.*?\):")
        else:  # TypeScript
            func_pattern = re.compile(r"^(async )?function (\w+)|^const (\w+) = (?:async )?\(")

        current_func = None
        func_start = 0
        func_lines = 0

        for i, line in enumerate(lines, 1):
            match = func_pattern.match(line.strip())
            if match:
                # Save previous function
                if current_func and func_lines > max_length:
                    violations.append(
                        PolicyViolation(
                            file_path=str(file_path),
                            line=func_start,
                            policy_category="function_design",
                            rule=f"max_function_length_{max_length}",
                            severity="warning",
                            message=f"Function '{current_func}' exceeds max length ({func_lines} > {max_length})",
                            suggestion=f"Consider breaking '{current_func}' into smaller functions",
                        )
                    )

                current_func = match.group(1) if match.group(1) else match.group(2)
                func_start = i
                func_lines = 0

                # Check parameter count
                params = line[line.find("(") + 1 : line.rfind(")")]
                param_count = len([p.strip() for p in params.split(",") if p.strip() and p.strip() not in ["self", "cls"]])
                if param_count > max_params:
                    violations.append(
                        PolicyViolation(
                            file_path=str(file_path),
                            line=i,
                            policy_category="function_design",
                            rule=f"max_parameters_{max_params}",
                            severity="warning",
                            message=f"Function '{current_func}' has too many parameters ({param_count} > {max_params})",
                            suggestion=f"Consider using a parameter object or data class for '{current_func}'",
                        )
                    )
            elif current_func:
                func_lines += 1

        return violations

    def _check_naming_conventions(
        self, rules: Dict, file_path: Path, lines: List[str]
    ) -> List[PolicyViolation]:
        """Check naming conventions."""
        violations = []

        # Check for single-letter variables
        forbidden_vars = rules.get("forbid_single_letter_vars", [])

        for i, line in enumerate(lines, 1):
            # Skip comments
            if line.strip().startswith("#") or line.strip().startswith("//"):
                continue

            # Find variable assignments
            if self.language == "python":
                var_pattern = re.compile(r"^\s*(\w+)\s*=")
            else:  # TypeScript
                var_pattern = re.compile(r"^\s*(?:const|let|var)\s+(\w+)\s*=")

            match = var_pattern.match(line)
            if match:
                var_name = match.group(1)
                if var_name in forbidden_vars:
                    violations.append(
                        PolicyViolation(
                            file_path=str(file_path),
                            line=i,
                            policy_category="naming_conventions",
                            rule="forbid_single_letter_vars",
                            severity="warning",
                            message=f"Variable '{var_name}' is a forbidden single-letter name",
                            suggestion=f"Use a descriptive name instead of '{var_name}'",
                        )
                    )

        return violations

    def _check_code_organization(
        self, rules: Dict, file_path: Path, lines: List[str]
    ) -> List[PolicyViolation]:
        """Check code organization rules."""
        violations = []
        max_file_length = rules.get("max_file_length", 500)

        if len(lines) > max_file_length:
            violations.append(
                PolicyViolation(
                    file_path=str(file_path),
                    line=1,
                    policy_category="code_organization",
                    rule=f"max_file_length_{max_file_length}",
                    severity="warning",
                    message=f"File exceeds max length ({len(lines)} > {max_file_length})",
                    suggestion="Consider splitting this file into smaller modules",
                )
            )

        return violations

    def _check_error_handling(
        self, rules: Dict, file_path: Path, lines: List[str]
    ) -> List[PolicyViolation]:
        """Check error handling rules."""
        violations = []

        if self.language == "python":
            # Check for bare except
            if rules.get("forbid_bare_except", True):
                except_pattern = re.compile(r"^\s*except\s*:")
                for i, line in enumerate(lines, 1):
                    if except_pattern.match(line):
                        violations.append(
                            PolicyViolation(
                                file_path=str(file_path),
                                line=i,
                                policy_category="error_handling",
                                rule="forbid_bare_except",
                                severity="error",
                                message="Bare except clause catches all exceptions",
                                suggestion="Specify the exception type (e.g., except ValueError)",
                            )
                        )
        else:  # TypeScript
            # Check for silent errors
            if rules.get("forbid_silent_errors", True):
                silent_error_pattern = re.compile(r"\.catch\(\(\)\s*=>\s*\{\s*\}\)")
                for i, line in enumerate(lines, 1):
                    if silent_error_pattern.search(line):
                        violations.append(
                            PolicyViolation(
                                file_path=str(file_path),
                                line=i,
                                policy_category="error_handling",
                                rule="forbid_silent_errors",
                                severity="error",
                                message="Silent error catch block",
                                suggestion="Add error handling or logging in catch block",
                            )
                        )

        return violations

    def _check_security(
        self, rules: Dict, file_path: Path, lines: List[str]
    ) -> List[PolicyViolation]:
        """Check security rules."""
        violations = []

        # Check for eval
        if rules.get("forbid_eval", True):
            eval_pattern = re.compile(r"\beval\s*\(")
            for i, line in enumerate(lines, 1):
                if eval_pattern.search(line):
                    violations.append(
                        PolicyViolation(
                            file_path=str(file_path),
                            line=i,
                            policy_category="security",
                            rule="forbid_eval",
                            severity="critical",
                            message="Use of eval() is a security risk",
                            suggestion="Find a safer alternative to eval()",
                        )
                    )

        # Check for hardcoded secrets
        if rules.get("forbid_hardcoded_secrets", True):
            secret_patterns = [
                re.compile(r'["\'](?:api_?key|secret|password|token)\s*[:=]\s*["\'][\w-]+["\']', re.IGNORECASE),
                re.compile(r'["\']sk-[a-zA-Z0-9]{20,}["\']'),  # Stripe keys
                re.compile(r'["\'][A-Za-z0-9+/]{32,}={0,2}["\']'),  # Base64 secrets
            ]
            for i, line in enumerate(lines, 1):
                for pattern in secret_patterns:
                    if pattern.search(line):
                        violations.append(
                            PolicyViolation(
                                file_path=str(file_path),
                                line=i,
                                policy_category="security",
                                rule="forbid_hardcoded_secrets",
                                severity="critical",
                                message="Possible hardcoded secret detected",
                                suggestion="Move secrets to environment variables",
                            )
                        )

        return violations

    def _check_testing(
        self, rules: Dict, file_path: Path, lines: List[str]
    ) -> List[PolicyViolation]:
        """Check testing rules."""
        violations = []

        # Check for test files without assertions
        if "test" in file_path.name.lower():
            has_assertion = False
            for line in lines:
                if self.language == "python":
                    if re.search(r"\bassert\s+", line):
                        has_assertion = True
                        break
                else:  # TypeScript
                    if re.search(r"\bexpect\s*\(", line):
                        has_assertion = True
                        break

            if not has_assertion and rules.get("require_assertions", True):
                violations.append(
                    PolicyViolation(
                        file_path=str(file_path),
                        line=1,
                        policy_category="testing",
                        rule="require_assertions",
                        severity="error",
                        message="Test file has no assertions",
                        suggestion="Add test assertions to verify behavior",
                    )
                )

        return violations

    def _check_documentation(
        self, rules: Dict, file_path: Path, lines: List[str]
    ) -> List[PolicyViolation]:
        """Check documentation rules."""
        violations = []

        # Check for module docstrings
        if rules.get("require_module_docstrings", True):
            if self.language == "python":
                has_docstring = False
                for i, line in enumerate(lines, 1):
                    if '"""' in line or "'''" in line:
                        has_docstring = True
                        break

                if not has_docstring:
                    violations.append(
                        PolicyViolation(
                            file_path=str(file_path),
                            line=1,
                            policy_category="documentation",
                            rule="require_module_docstrings",
                            severity="warning",
                            message="Module has no docstring",
                            suggestion="Add a docstring describing the module's purpose",
                        )
                    )

        return violations

    def _check_component_design(
        self, rules: Dict, file_path: Path, lines: List[str]
    ) -> List[PolicyViolation]:
        """Check React component design rules."""
        violations = []

        # Check for too many props
        max_props = rules.get("max_props", 8)
        prop_pattern = re.compile(r"interface\s+(\w+)Props|type\s+(\w+)Props")

        for i, line in enumerate(lines, 1):
            match = prop_pattern.match(line)
            if match:
                prop_name = match.group(1) if match.group(1) else match.group(2)

                # Count props in the interface/type
                prop_count = 0
                for j in range(i, min(i + 50, len(lines))):
                    if lines[j].strip().startswith("}"):
                        break
                    if ":" in lines[j] and not lines[j].strip().startswith("//"):
                        prop_count += 1

                if prop_count > max_props:
                    violations.append(
                        PolicyViolation(
                            file_path=str(file_path),
                            line=i,
                            policy_category="component_design",
                            rule=f"max_props_{max_props}",
                            severity="warning",
                            message=f"Component '{prop_name}' has too many props ({prop_count} > {max_props})",
                            suggestion=f"Consider composing '{prop_name}' or using a prop object",
                        )
                    )

        return violations

    def _check_hooks_usage(
        self, rules: Dict, file_path: Path, lines: List[str]
    ) -> List[PolicyViolation]:
        """Check React hooks usage rules."""
        violations = []

        # Check for conditional hooks
        if rules.get("forbid_conditional_hooks", True):
            hook_pattern = re.compile(r"use\w+")
            if_pattern = re.compile(r"^\s*(if|else|for|while|switch)")

            in_if_block = False
            if_depth = 0

            for i, line in enumerate(lines, 1):
                if if_pattern.match(line):
                    in_if_block = True
                    if_depth += 1
                elif line.strip() == "}" and in_if_block:
                    if_depth -= 1
                    if if_depth == 0:
                        in_if_block = False

                if in_if_block and hook_pattern.search(line):
                    violations.append(
                        PolicyViolation(
                            file_path=str(file_path),
                            line=i,
                            policy_category="hooks_usage",
                            rule="forbid_conditional_hooks",
                            severity="error",
                            message="Hook called inside conditional block",
                            suggestion="Move hook call to the top level of the component",
                        )
                    )

        return violations

    def _check_state_management(
        self, rules: Dict, file_path: Path, lines: List[str]
    ) -> List[PolicyViolation]:
        """Check state management rules."""
        violations = []

        # Check for excessive useState
        max_state_complexity = rules.get("max_state_complexity", 3)
        use_state_count = sum(1 for line in lines if "useState" in line)

        if use_state_count > max_state_complexity:
            violations.append(
                PolicyViolation(
                    file_path=str(file_path),
                    line=1,
                    policy_category="state_management",
                    rule=f"max_state_complexity_{max_state_complexity}",
                    severity="warning",
                    message=f"Component has too many useState calls ({use_state_count} > {max_state_complexity})",
                    suggestion="Consider using useReducer for complex state",
                )
            )

        return violations

    def _check_performance(
        self, rules: Dict, file_path: Path, lines: List[str]
    ) -> List[PolicyViolation]:
        """Check performance rules."""
        violations = []

        # Check for missing memoization
        if rules.get("require_memoization", True):
            has_memo = any("useMemo" in line or "useCallback" in line for line in lines)
            has_function = any("function" in line or "=>" in line for line in lines)

            if has_function and not has_memo:
                violations.append(
                    PolicyViolation(
                        file_path=str(file_path),
                        line=1,
                        policy_category="performance",
                        rule="require_memoization",
                        severity="info",
                        message="Component has functions without memoization",
                        suggestion="Consider using useMemo/useCallback for performance",
                    )
                )

        return violations

    def _check_accessibility(
        self, rules: Dict, file_path: Path, lines: List[str]
    ) -> List[PolicyViolation]:
        """Check accessibility rules."""
        violations = []

        # Check for images without alt text
        if rules.get("require_alt_text", True):
            img_pattern = re.compile(r'<img\s+[^>]*(?<!alt\s*=)[^>]*>')
            for i, line in enumerate(lines, 1):
                if img_pattern.search(line) and "alt=" not in line:
                    violations.append(
                        PolicyViolation(
                            file_path=str(file_path),
                            line=i,
                            policy_category="accessibility",
                            rule="require_alt_text",
                            severity="error",
                            message="Image missing alt text",
                            suggestion="Add alt text to the image for accessibility",
                        )
                    )

        return violations

    def format_violations(self, violations: List[PolicyViolation]) -> str:
        """Format violations for display."""
        if not violations:
            return "No violations found."

        output = []
        output.append(f"Found {len(violations)} policy violation(s):")
        output.append("=" * 60)

        for v in violations:
            icon = {"critical": "🔴", "error": "❌", "warning": "⚠️", "info": "ℹ️"}.get(
                v.severity, "?"
            )
            output.append(f"{icon} [{v.severity.upper()}] {v.file_path}:{v.line}")
            output.append(f"   {v.policy_category}.{v.rule}")
            output.append(f"   {v.message}")
            if v.suggestion:
                output.append(f"   💡 {v.suggestion}")
            output.append("")

        return "\n".join(output)


def get_policy_enforcer(target: str) -> PolicyEnforcer:
    """Get policy enforcer for target."""
    policies_dir = Path(__file__).parent.parent / "policies"

    if target == "backend":
        policy_path = policies_dir / "backend-refactoring-policy.json"
    elif target == "frontend":
        policy_path = policies_dir / "frontend-refactoring-policy.json"
    else:
        raise ValueError(f"Unknown target: {target}")

    return PolicyEnforcer(policy_path)