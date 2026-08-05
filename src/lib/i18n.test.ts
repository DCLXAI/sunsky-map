import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { translations } from './i18n';

const SRC = path.resolve(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
            return entry === 'generated' ? [] : sourceFiles(full);
        }
        return /\.tsx?$/.test(entry) && !entry.endsWith('.test.ts') ? [full] : [];
    });
}

/** Matches t("…") and t('…') with no interpolation, which is every call we make. */
const T_CALL = /\bt\(\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1\s*\)/g;

describe('translations', () => {
    it('covers every key the app actually asks for', () => {
        const missing: string[] = [];

        for (const file of sourceFiles(SRC)) {
            const contents = readFileSync(file, 'utf8');
            for (const [, , key] of contents.matchAll(T_CALL)) {
                if (!(key in translations)) {
                    missing.push(`${path.relative(SRC, file)}: ${key}`);
                }
            }
        }

        expect(missing).toEqual([]);
    });

    it('gives every key both languages, non-empty', () => {
        const broken = Object.entries(translations)
            .filter(([, value]) => !value.en?.trim() || !value.ko?.trim())
            .map(([key]) => key);

        expect(broken).toEqual([]);
    });

    it('actually translates rather than echoing English', () => {
        // A handful of keys are legitimately identical across languages (proper
        // nouns, "Top"), so only flag it when most of the table is untranslated.
        const identical = Object.values(translations).filter((v) => v.en === v.ko);
        expect(identical.length).toBeLessThan(Object.keys(translations).length / 4);
    });
});
