# Skills Directory

This directory contains specialized skills that the agent can load and use to enhance its capabilities.

## Structure

Each skill is organized as follows:

```
skills/
├── skill-name/
│   ├── SKILL.md          # Required: Main skill definition
│   ├── scripts/          # Optional: Executable scripts
│   ├── references/       # Optional: Reference materials
│   └── assets/           # Optional: Images, diagrams, etc.
└── README.md             # This file
```

## SKILL.md Format

Each skill must have a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: skill-name
description: Brief description of what this skill does
---

# Skill Name

Detailed description of the skill, including:
- Core competencies
- Best practices
- Frameworks or methodologies
- Any other relevant information

## Available Resources

Scripts, references, and assets may be available in the skill directories.
```

## Current Skills

### investor-analysis
Advanced financial analysis and investment research capabilities.

### data-processing
Data extraction, transformation, and loading capabilities for investment data.

## Adding New Skills

To add a new skill:

1. Create a new directory under `skills/`
2. Add a `SKILL.md` file with proper frontmatter
3. Optionally add `scripts/`, `references/`, and `assets/` subdirectories
4. The agent will automatically detect and load the skill

## Using Skills

Skills are automatically loaded by the agent based on the task requirements. The agent can use the `Skill` tool to load specific skills when needed.

For more information, see the [agentic-system documentation](https://github.com/anthropics/agentic-system).
