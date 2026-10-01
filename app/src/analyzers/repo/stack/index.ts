import { basename } from '../../../lib/util';
import { goMod } from './go-mod';
import { cargo, composer, gemfile, gradle, maven, pubspec } from './others';
import { packageJson } from './package-json';
import { pipfile, pyproject, requirements, setupPy } from './requirements';
import type { ManifestParser, ManifestResult } from './types';

/** Adding an ecosystem = adding a parser here. */
export const MANIFEST_PARSERS: ManifestParser[] = [
  packageJson, requirements, pyproject, pipfile, setupPy, goMod, cargo, gemfile, composer, maven, gradle, pubspec,
];

export function parseManifest(path: string, content: string): ManifestResult | null {
  const name = basename(path);
  const parser = MANIFEST_PARSERS.find((p) => p.match(name));
  if (!parser) return null;
  try {
    return parser.parse(path, content);
  } catch {
    return null;
  }
}

export * from './types';
