import { validateMacro } from './macro-recipe.js';
import { readFile, readdir } from 'node:fs/promises';

const stateName = /^[a-z][a-z0-9_]{0,63}$/;
const fieldName = /^[a-z][a-zA-Z0-9]{0,63}$/;

function selector(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) throw new Error('Invalid workflow selector');
  return value;
}

export function validateBrowserWorkflow(value) {
  if(value?.schemaVersion===2)return validateMacro(value);
  if (!value || value.schemaVersion !== 1 || typeof value.id !== 'string' || !/^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/.test(value.id) ||
    typeof value.provider !== 'string' || value.id.split('.')[0] !== value.provider || value.effect !== 'read') {
    throw new Error('Invalid browser workflow definition');
  }
  let url;
  try { url = new URL(value.origin); } catch { throw new Error('Invalid workflow origin'); }
  if (url.protocol !== 'https:' || url.origin !== value.origin) throw new Error('Invalid workflow origin');
  if (typeof value.path !== 'string' || !value.path.startsWith('/') || value.path.startsWith('//') || value.path.includes('\\') || new URL(value.path, value.origin).origin !== value.origin) {
    throw new Error('Invalid workflow path');
  }
  selector(value.signedInSelector);
  selector(value.readySelector);
  if (!Array.isArray(value.checks) || value.checks.length > 10 || !Array.isArray(value.extract) || value.extract.length < 1 || value.extract.length > 10) {
    throw new Error('Invalid workflow steps');
  }
  for (const check of value.checks) {
    selector(check.selector);
    if (!Number.isInteger(check.equals) || check.equals < 1 || check.equals > 100 || !stateName.test(check.otherwise) || (check.ifZero && !stateName.test(check.ifZero))) {
      throw new Error('Invalid workflow check');
    }
  }
  if (value.fill !== undefined) {
    if (!Array.isArray(value.fill) || value.fill.length > 20) throw new Error('Invalid workflow fill steps');
    for (const step of value.fill) {
      selector(step?.selector);
      if (!['text', 'select', 'checkbox', 'contenteditable'].includes(step.inputKind) ||
        (step.inputKind === 'checkbox' ? typeof step.value !== 'boolean' : typeof step.value !== 'string' || step.value.length > 500)) {
        throw new Error('Invalid workflow fill step');
      }
    }
  }
  const fields = new Set();
  for (const item of value.extract) {
    selector(item.selector);
    if (!fieldName.test(item.field) || fields.has(item.field) || !['first', 'last', 'all'].includes(item.pick) || !Number.isInteger(item.maxLength) || item.maxLength < 1 || item.maxLength > 10000 ||
      (item.pick === 'all' && (!Number.isInteger(item.maxItems) || item.maxItems < 1 || item.maxItems > 100))) {
      throw new Error('Invalid workflow extraction');
    }
    fields.add(item.field);
  }
  return Object.freeze(value);
}

export async function loadBrowserWorkflows(directory = new URL('../workflows/', import.meta.url)) {
  const definitions = [];
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.json')).sort()) {
    definitions.push(validateBrowserWorkflow(JSON.parse(await readFile(new URL(file, directory), 'utf8'))));
  }
  if (new Set(definitions.map(item => item.id)).size !== definitions.length) throw new Error('Duplicate browser workflow');
  return definitions;
}
