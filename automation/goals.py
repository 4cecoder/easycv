#!/usr/bin/env python3
"""Goal and todo management for EasyCV automation."""

import argparse
import json
import subprocess
from pathlib import Path
from datetime import datetime, timezone


ROOT = Path(__file__).resolve().parent.parent
GOALS_FILE = ROOT / "GOALS.md"
TODOS_FILE = ROOT / "TODOS.md"


def parse_todos():
    """Parse TODOS.md and extract active items."""
    if not TODOS_FILE.exists():
        return []
    
    todos = []
    current_priority = None
    
    for line in TODOS_FILE.read_text().splitlines():
        line = line.strip()
        if line.startswith("## Priority"):
            # Extract priority number: "Priority 1 (Do Today)"
            try:
                current_priority = int(line.split()[1])
            except (ValueError, IndexError):
                current_priority = 99
        elif line.startswith("- [ ]"):
            task = line.split("]", 1)[1].strip()
            todos.append({
                "task": task,
                "priority": current_priority,
                "status": "pending"
            })
        elif line.startswith("- [x]"):
            task = line.split("]", 1)[1].strip()
            todos.append({
                "task": task,
                "priority": current_priority,
                "status": "completed"
            })
    
    return sorted(todos, key=lambda x: x.get("priority", 99))


def show_todos():
    """Display todos by priority."""
    todos = parse_todos()
    
    pending = [t for t in todos if t["status"] == "pending"]
    completed = [t for t in todos if t["status"] == "completed"]
    
    print(f"📋 Pending: {len(pending)} | Completed: {len(completed)}\n")
    
    current_prio = None
    for todo in pending:
        if todo["priority"] != current_prio:
            current_prio = todo["priority"]
            prio_labels = {1: "🔥 Do Today", 2: "⚡ This Week", 3: "📅 Next Sprint"}
            print(f"\n{prio_labels.get(current_prio, f'Priority {current_prio}')}:")
        print(f"  - [ ] {todo['task']}")


def add_todo(task, priority=1):
    """Add a new todo."""
    content = TODOS_FILE.read_text() if TODOS_FILE.exists() else "# EasyCV Active Todos\n\n"
    
    # Find the right priority section
    lines = content.splitlines()
    insert_pos = None
    
    for i, line in enumerate(lines):
        if line.startswith(f"## Priority {priority}"):
            insert_pos = i + 1
            break
    
    if insert_pos is None:
        # Create new priority section
        if "## Completed Today" in content:
            insert_pos = content.index("## Completed Today")
        else:
            insert_pos = len(lines)
        lines.insert(insert_pos, f"## Priority {priority} (Do Soon)")
        lines.insert(insert_pos + 1, "- [ ] " + task)
    else:
        lines.insert(insert_pos, "- [ ] " + task)
    
    TODOS_FILE.write_text("\n".join(lines))
    print(f"✅ Added todo: {task}")


def complete_todo(task_pattern):
    """Mark todos matching pattern as completed."""
    if not TODOS_FILE.exists():
        print("No todos file found")
        return
    
    content = TODOS_FILE.read_text()
    lines = content.splitlines()
    modified = False
    
    for i, line in enumerate(lines):
        if task_pattern.lower() in line.lower() and line.startswith("- [ ]"):
            lines[i] = line.replace("- [ ]", "- [x]")
            modified = True
            print(f"✅ Completed: {line.split(']', 1)[1].strip()}")
    
    if modified:
        TODOS_FILE.write_text("\n".join(lines))
    else:
        print(f"No todos matching: {task_pattern}")


def show_goals():
    """Display goals from GOALS.md."""
    if not GOALS_FILE.exists():
        print("No goals file found")
        return
    
    content = GOALS_FILE.read_text()
    print(content)


def show_automation_status():
    """Show combined automation status."""
    # Parse progress.json
    progress_file = ROOT / "automation" / "progress.json"
    if progress_file.exists():
        progress = json.loads(progress_file.read_text())
        runs = progress.get("runs", [])
        fixes = progress.get("fixes", [])
        print(f"🤖 Automation: {len(runs)} runs, {len(fixes)} fixes")
        
        if runs:
            last = runs[-1]
            print(f"   Last: {last.get('type', 'unknown')} — {last.get('conclusion', 'incomplete')}")
    
    # Show todos
    todos = parse_todos()
    pending = [t for t in todos if t["status"] == "pending"]
    print(f"📋 Todos: {len(pending)} pending")
    
    # Show test status
    try:
        result = subprocess.run(
            ["uv", "run", "pytest", "--tb=no", "-q"],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=str(ROOT)
        )
        summary = result.stdout.strip()
        if summary:
            print(f"🧪 Tests: {summary}")
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(prog="easycv-goals", description="Goal and todo management")
    sub = parser.add_subparsers(dest="command", required=True)
    
    # todos
    p_todos = sub.add_parser("todos", help="Show todos by priority")
    
    # add
    p_add = sub.add_parser("add", help="Add a new todo")
    p_add.add_argument("task", help="Task description")
    p_add.add_argument("--priority", type=int, default=1, help="Priority (1=today, 2=week, 3=sprint)")
    
    # done
    p_done = sub.add_parser("done", help="Mark todo as completed")
    p_done.add_argument("pattern", help="Pattern to match todos")
    
    # goals
    sub.add_parser("goals", help="Show goals")
    
    # status
    sub.add_parser("status", help="Show combined status")
    
    args = parser.parse_args()
    
    if args.command == "todos":
        show_todos()
    elif args.command == "add":
        add_todo(args.task, args.priority)
    elif args.command == "done":
        complete_todo(args.pattern)
    elif args.command == "goals":
        show_goals()
    elif args.command == "status":
        show_automation_status()


if __name__ == "__main__":
    main()