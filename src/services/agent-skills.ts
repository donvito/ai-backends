import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { SkillDefinition } from './admin-store';

/**
 * Skills support for agents, following the Agent Skills progressive
 * disclosure model: only skill names and descriptions are always in the
 * system prompt; the agent loads full instructions on demand by calling the
 * use_skill tool.
 */

/**
 * System prompt section listing the skills available to an agent.
 */
export function buildSkillsPromptSection(skills: SkillDefinition[]): string {
  if (skills.length === 0) return '';
  const entries = skills
    .map((skill) => `  <skill name="${skill.name}">${skill.description}</skill>`)
    .join('\n');
  return [
    '',
    'You have access to skills: packages of instructions for specific tasks.',
    'When a task matches a skill description, call the use_skill tool with the skill name FIRST and follow the returned instructions.',
    '<available_skills>',
    entries,
    '</available_skills>',
  ].join('\n');
}

const useSkillSchema = Type.Object({
  name: Type.String({ description: 'Name of the skill to load' }),
});

/**
 * Build the use_skill tool scoped to a specific set of skills.
 */
export function buildUseSkillTool(skills: SkillDefinition[]): AgentTool<typeof useSkillSchema> {
  return {
    name: 'use_skill',
    label: 'Load a skill',
    description:
      'Load the full instructions of an available skill. Call this before performing a task covered by a skill, then follow the returned instructions.',
    parameters: useSkillSchema,
    execute: async (_toolCallId, params) => {
      const skill = skills.find((candidate) => candidate.name === params.name);
      if (!skill) {
        const available = skills.map((candidate) => candidate.name).join(', ') || '(none)';
        throw new Error(`Unknown skill "${params.name}". Available skills: ${available}`);
      }
      return {
        content: [{ type: 'text' as const, text: `# Skill: ${skill.name}\n\n${skill.content}` }],
        details: { skill: skill.name },
      };
    },
  };
}
