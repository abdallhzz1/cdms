import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve('src');
const arabic = /[\u0600-\u06ff]/;
const files = [];
const walk = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) && !full.includes(`${path.sep}i18n${path.sep}locales${path.sep}`)) files.push(full);
  }
};
walk(root);

const violations = [];
for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = node => {
    const text = ts.isJsxText(node) || ts.isStringLiteralLike(node) ? node.text : null;
    if (text && arabic.test(text) && !isTranslated(node)) {
      const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
      violations.push({ file: path.relative(process.cwd(), file).replaceAll('\\', '/'), line: pos.line + 1, text: text.trim().replace(/\s+/g, ' ').slice(0, 120) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function isTranslated(node) {
  for (let current = node; current; current = current.parent) {
    if (ts.isCallExpression(current)) {
      const name = current.expression.getText();
      if (['tr', 't', 'translate', 'bilingual'].includes(name)) return true;
    }
    if (ts.isConditionalExpression(current)) return true;
    if (ts.isPropertyAssignment(current) && current.name.getText().replace(/["']/g, '') === 'ar') return true;
    if (ts.isObjectLiteralExpression(current)) {
      const names = current.properties.filter(ts.isPropertyAssignment).map(property => property.name.getText().replace(/["']/g, ''));
      if (names.includes('ar') && names.includes('en')) return true;
    }
    if (ts.isSourceFile(current)) break;
  }
  return false;
}

for (const item of violations) console.log(`${item.file}:${item.line}\t${item.text}`);
console.log(`\nUntranslated Arabic literals: ${violations.length}`);
process.exitCode = violations.length ? 1 : 0;
