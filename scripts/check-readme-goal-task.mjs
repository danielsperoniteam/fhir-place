import { readFileSync } from 'node:fs';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

const requiredSnippets = [
  '### Goal/Task deployable starter',
  'useSearch',
  '<ResourceSearch>',
  '<ResourceView>',
  '<ResourceEditor>',
  'useCreateResource',
  'useUpdateResource',
  'Task.status',
  'Goal.lifecycleStatus',
];

const missing = requiredSnippets.filter((snippet) => !readme.includes(snippet));

if (missing.length > 0) {
  console.error('README.md is missing Goal/Task deployable starter content:');
  for (const snippet of missing) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log('README.md Goal/Task deployable starter content is present.');
