const fs = require('fs');
const glob = require('fs').readdirSync;

const dir = 'src/components';
const files = glob(dir).map(f => dir + '/' + f).filter(f => f.endsWith('.tsx'));
files.push('src/App.tsx');

const replacements = [
  [/bg-\[\#020617\]/g, 'bg-slate-50 dark:bg-[#020617]'],
  [/bg-\[#0f172a\]/g, 'bg-white dark:bg-[#0f172a]'],
  [/\btext-slate-100\b/g, 'text-slate-900 dark:text-slate-100'],
  [/\btext-white\b/g, 'text-slate-900 dark:text-white'],
  [/\bhilite-white\b/g, 'text-slate-900 dark:text-white'], // just in case
  [/\bbg-white\/5\b/g, 'bg-white dark:bg-white/5'],
  [/\bbg-white\/10\b/g, 'bg-slate-50 dark:bg-white/10'],
  [/\bbg-white\/20\b/g, 'bg-slate-100 dark:bg-white/20'],
  [/\bborder-white\/10\b/g, 'border-slate-200 dark:border-white/10'],
  [/\bhover:bg-white\/10\b/g, 'hover:bg-slate-50 dark:hover:bg-white/10'],
  [/\bhover:bg-white\/20\b/g, 'hover:bg-slate-100 dark:hover:bg-white/20'],
  [/\bhover:text-white\b/g, 'hover:text-slate-900 dark:hover:text-white'],
  [/\btext-slate-400\b/g, 'text-slate-500 dark:text-slate-400'],
  [/\btext-slate-300\b/g, 'text-slate-600 dark:text-slate-300'],
  [/\bbg-black\/20\b/g, 'bg-slate-50 dark:bg-black/20'],
  [/\bbg-black\/60\b/g, 'bg-slate-900\/40 dark:bg-black/60'],
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  replacements.forEach(([regex, replace]) => {
     content = content.replace(regex, replace);
  });
  
  // Fix double replacements if any
  content = content.replace(/dark:dark:/g, 'dark:');
  content = content.replace(/text-slate-900 dark:text-slate-900 dark:text-white/g, 'text-slate-900 dark:text-white');
  content = content.replace(/text-slate-900 dark:text-slate-900 dark:text-slate-100/g, 'text-slate-900 dark:text-slate-100');
  content = content.replace(/bg-slate-50 dark:bg-slate-50 dark:bg-\[\#020617\]/g, 'bg-slate-50 dark:bg-[#020617]');
  content = content.replace(/bg-white dark:bg-white dark:bg-white\/5/g, 'bg-white dark:bg-white/5');
  // ... any obvious duplicates
  fs.writeFileSync(file, content);
});
