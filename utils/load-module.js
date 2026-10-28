const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { pathToFileURL } = require('url');

const ESM_SYNTAX = /^\s*(?:import\s+(?!\()|export\s+(?:default\b|\{|\*|(?:async\s+)?(?:function|class|const|let|var)\b))/m;

function hasEsmSyntax(source) {
    return ESM_SYNTAX.test(source);
}

async function loadProjectModule(filePath) {
    const absolutePath = path.resolve(filePath);
    const source = fs.readFileSync(absolutePath, 'utf8');

    if (hasEsmSyntax(source)) {
        // Keep the source tree's CommonJS package mode, but give ESM command
        // files an .mjs URL so Node parses them as modules. The temporary file
        // stays beside its source so import.meta.url-relative paths still work.
        const temporaryPath = path.join(
            path.dirname(absolutePath),
            `.${path.basename(absolutePath)}.${process.pid}.${randomUUID()}.mjs`
        );

        fs.writeFileSync(temporaryPath, source, 'utf8');
        try {
            return await import(pathToFileURL(temporaryPath).href);
        } finally {
            fs.rmSync(temporaryPath, { force: true });
        }
    }

    const resolvedPath = require.resolve(absolutePath);
    delete require.cache[resolvedPath];
    return { default: require(resolvedPath) };
}

module.exports = { hasEsmSyntax, loadProjectModule };
