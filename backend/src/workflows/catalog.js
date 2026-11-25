import { vinted } from '../providers/vinted.js';

export const providers = Object.freeze([vinted]);
export const workflows = Object.freeze(providers.flatMap(provider => provider.workflows));
