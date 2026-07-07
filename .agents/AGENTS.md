# 👑 Project-Specific Agent Collaboration Rules (Project AGENTS.md)

This document defines the project-specific behavior guidelines and architectural rules applied exclusively within the local project workspace.
Common global guidelines are defined in the home directory's [Global Rules (GEMINI.md)](file:///C:/Users/wlrlx/.gemini/GEMINI.md) and are loaded together during execution.

---

## 1. Project Directory Structure & Synchronization

### **[Priority 1: Structure] Project Directory Structure & Sync**
- This project strictly separates the program source code from the agent workspace to prevent AI planning files and logs from polluting the Git repository:

```text
{workspace_root}/ (Workspace Root - Git Repository Area)
│
├── .agents/ (Antigravity System Directory - Ignored by Git)
│   ├── AGENTS.md (This rule file - English version)
│   ├── plugins/ (Agent plugins directory)
│   │   ├── harness-plugin/
│   │   └── {domain_specific_plugins}/
│   │
│   └── projects/ (Project status and logging space)
│       └── {project_name}/
│           ├── STATUS.md (Status board)
│           ├── logs/ (Subagent communication log files)
│           └── _workspace/ (SDLC phases and AI work items)
│               ├── 01_planning/
│               ├── 02_requirements/
│               ├── 03_design/
│               ├── 04_development/
│               ├── 05_testing/
│               └── 06_deployment/
│
└── {project_name}/ (Web Portal Source Code - Tracked by Git)
```

---

## 2. Logging & Asset Management Rules

### **[Priority 2: Transparency] Logging**
- All communications (requests, responses, task completions) between the Main Agent and subagents must be written to individual `.md` log files.
- **Naming Rule:** `YYYYMMDD_HHMMSS_[Sender]_[Recipient]_[TaskName].md`
- Store these log files under the project-specific logs folder: `.agents/projects/{project_name}/logs/`.

### **[Priority 3: Structure] Script Preservation**
- Any helper python scripts or build tools created for database patches, file analyses, or updates must not be left in temporary directories. Save them inside the version-controlled scripts folder: `{project_name}/scripts/` or `{project_name}/src/`.

### **[Priority 4: Efficiency/Structure] Harness Team Reuse**
- When configuring a new subagent or harness, clone or reference existing profiles of similar domains to avoid redundant setups.
