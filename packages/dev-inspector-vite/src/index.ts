import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';

type StyleIntentEntry = {
  id: string;
  createdAt: string;
  status: 'pending' | 'resolved';
  pageUrl?: string;
  panelKind?: string;
  scopeLabel?: string;
  selector?: string;
  targetLabel?: string;
  note?: string;
  entries: { selector: string; changes: { prop: string; val: string; from?: string }[] }[];
};

type DevInspectorServerOptions = {
  projectRoot: string;
  cssFile?: string;
  styleInboxJsonFile?: string;
  styleInboxMarkdownFile?: string;
  commitTargetFile?: string;
};

function getStyleIntentMergeKey(entry: StyleIntentEntry) {
  return [
    entry.panelKind ?? '',
    entry.scopeLabel ?? '',
    entry.selector ?? '',
    entry.targetLabel ?? '',
  ].join('||');
}

function mergeEntryGroups(
  primary: StyleIntentEntry['entries'],
  secondary: StyleIntentEntry['entries'],
) {
  const groupMap = new Map<string, { selector: string; changes: { prop: string; val: string; from?: string }[] }>();

  const appendGroups = (groups: StyleIntentEntry['entries']) => {
    groups.forEach((group) => {
      const selector = group.selector;
      if (!selector) return;
      if (!groupMap.has(selector)) {
        groupMap.set(selector, { selector, changes: [] });
      }
      const targetGroup = groupMap.get(selector)!;
      group.changes.forEach((change) => {
        if (!change.prop || !change.val) return;
        if (!targetGroup.changes.some((item) => item.prop === change.prop)) {
          targetGroup.changes.push(change);
        }
      });
    });
  };

  appendGroups(primary);
  appendGroups(secondary);

  return Array.from(groupMap.values()).filter((group) => group.changes.length > 0);
}

function compactStyleIntentEntries(entries: StyleIntentEntry[]) {
  const merged: StyleIntentEntry[] = [];
  const pendingIndexByKey = new Map<string, number>();

  entries.forEach((entry) => {
    if (entry.status !== 'pending') {
      merged.push(entry);
      return;
    }

    const mergeKey = getStyleIntentMergeKey(entry);
    const existingIndex = pendingIndexByKey.get(mergeKey);
    if (existingIndex === undefined) {
      pendingIndexByKey.set(mergeKey, merged.length);
      merged.push({
        ...entry,
        entries: mergeEntryGroups(entry.entries, []),
      });
      return;
    }

    const existing = merged[existingIndex];
    merged[existingIndex] = {
      ...existing,
      note: existing.note || entry.note,
      entries: mergeEntryGroups(existing.entries, entry.entries),
    };
  });

  return merged;
}

function normalizeAndCompactStore(store: { entries: StyleIntentEntry[] }) {
  const normalized = normalizeStyleIntentStore(store);
  return {
    entries: compactStyleIntentEntries(normalized.entries),
  };
}

function normalizeStyleIntentStore(store: { entries: StyleIntentEntry[] }) {
  return {
    entries: (store.entries || []).map((entry) => ({
      ...entry,
      entries: (entry.entries || [])
        .map((group) => ({
          ...group,
          changes: (group.changes || []).filter((change) => change.prop && change.val),
        }))
        .filter((group) => group.selector && group.changes.length > 0),
    })),
  };
}

function buildCssBlock(entries: { selector: string; changes: { prop: string; val: string }[]; note?: string }[]) {
  return entries.map(({ selector, changes, note }) => {
    const lines = changes.map((c) => `  ${c.prop}: ${c.val};`);
    return [
      `\n/* DevInspector: ${new Date().toLocaleString('zh-CN')} */`,
      note ? `/* ${note} */` : '',
      `${selector} {`,
      ...lines,
      '}',
    ].filter(Boolean).join('\n');
  }).join('\n') + '\n';
}

export function createDevInspectorServerPlugin(options: DevInspectorServerOptions) {
  const projectRoot = options.projectRoot;
  const cssFile = options.cssFile ?? path.resolve(projectRoot, 'src/styles/index.css');
  const styleInboxJsonFile = options.styleInboxJsonFile ?? path.resolve(projectRoot, 'docs/style-inbox.json');
  const styleInboxMarkdownFile = options.styleInboxMarkdownFile ?? path.resolve(projectRoot, 'docs/STYLE_INBOX.md');
  const commitTargetFile = options.commitTargetFile ?? 'src/styles/dev-overrides.css';

  function ensureStyleInboxStore() {
    if (!fs.existsSync(styleInboxJsonFile)) {
      fs.writeFileSync(styleInboxJsonFile, JSON.stringify({ entries: [] }, null, 2));
    }
  }

  function readStyleInboxStore(): { entries: StyleIntentEntry[] } {
    ensureStyleInboxStore();
    const raw = JSON.parse(fs.readFileSync(styleInboxJsonFile, 'utf-8'));
    const normalized = normalizeStyleIntentStore(raw);
    const compacted = normalizeAndCompactStore(raw);
    if (JSON.stringify(normalized) !== JSON.stringify(compacted)) {
      fs.writeFileSync(styleInboxJsonFile, JSON.stringify(compacted, null, 2));
    }
    return compacted;
  }

  function writeStyleInboxStore(data: { entries: StyleIntentEntry[] }) {
    fs.writeFileSync(styleInboxJsonFile, JSON.stringify(normalizeAndCompactStore(data), null, 2));
  }

  function appendStyleInbox(payload: {
    pageUrl?: string;
    panelKind?: string;
    scopeLabel?: string;
    selector?: string;
    targetLabel?: string;
    note?: string;
    entries: { selector: string; changes: { prop: string; val: string; from?: string }[] }[];
  }): StyleIntentEntry {
    if (!fs.existsSync(styleInboxMarkdownFile)) {
      fs.writeFileSync(
        styleInboxMarkdownFile,
        '# Style Inbox\n\n> 用户通过 DevInspector 提交给 AI 助手的样式意图收集处。\n> 这里记录的是“待固化”的设计改动，不等于已经完成正式代码收敛。\n\n',
      );
    }

    const store = readStyleInboxStore();
    const newEntry: StyleIntentEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      status: 'pending',
      pageUrl: payload.pageUrl,
      panelKind: payload.panelKind,
      scopeLabel: payload.scopeLabel,
      selector: payload.selector,
      targetLabel: payload.targetLabel,
      note: payload.note,
      entries: payload.entries,
    };
    store.entries.unshift(newEntry);
    writeStyleInboxStore(store);
    const mergedStore = readStyleInboxStore();
    const mergeKey = getStyleIntentMergeKey(newEntry);
    const entry = mergedStore.entries.find((item) => item.status === 'pending' && getStyleIntentMergeKey(item) === mergeKey) ?? newEntry;

    const cssBlocks = payload.entries.map(({ selector, changes }) => {
      const lines = changes.map(({ prop, val }) => `  ${prop}: ${val};`);
      return `${selector} {\n${lines.join('\n')}\n}`;
    }).join('\n\n');

    const lines = [
      `\n## ${new Date().toLocaleString('zh-CN')}`,
      '- 状态：待 AI 固化',
      payload.pageUrl ? `- 页面：${payload.pageUrl}` : '',
      payload.panelKind ? `- 面板：${payload.panelKind}` : '',
      payload.scopeLabel ? `- 作用范围：${payload.scopeLabel}` : '',
      payload.targetLabel ? `- 目标：${payload.targetLabel}` : '',
      payload.selector ? `- 选择器：\`${payload.selector}\`` : '',
      payload.note ? `- 备注：${payload.note}` : '',
      '',
      '```css',
      cssBlocks,
      '```',
      '',
    ].filter(Boolean);

    fs.appendFileSync(styleInboxMarkdownFile, lines.join('\n'));
    return entry;
  }

  function getStyleIntentSummary() {
    const store = readStyleInboxStore();
    const pending = store.entries.filter((entry) => entry.status === 'pending');
    return {
      pendingCount: pending.length,
      latestPending: pending[0] ?? null,
      pendingEntries: pending,
    };
  }

  function deleteStyleIntent(payload: { id: string; selector?: string; prop?: string }) {
    const store = readStyleInboxStore();
    let changed = false;
    const nextEntries = store.entries.map((entry) => {
      if (entry.id !== payload.id) return entry;
      changed = true;

      if (!payload.selector || !payload.prop) {
        return { ...entry, status: 'resolved' as const };
      }

      const nextGroups = entry.entries
        .map((group) => {
          if (group.selector !== payload.selector) return group;
          return {
            ...group,
            changes: group.changes.filter((change) => change.prop !== payload.prop),
          };
        })
        .filter((group) => group.changes.length > 0);

      if (nextGroups.length === 0) {
        return { ...entry, status: 'resolved' as const, entries: [] };
      }

      return { ...entry, entries: nextGroups };
    });

    if (!changed) return { ok: false, error: 'NOT_FOUND' };
    writeStyleInboxStore({ entries: nextEntries });
    return { ok: true, ...getStyleIntentSummary() };
  }

  return {
    name: 'dev-inspector-server',
    configureServer(server: any) {
      server.middlewares.use('/__dev/apply-css', (req: any, res: any) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (c: any) => body += c);
        req.on('end', () => {
          try {
            const payload = JSON.parse(body);
            const entries = Array.isArray(payload.entries)
              ? payload.entries
              : [{ selector: payload.selector, changes: payload.changes, note: payload.note }];
            const block = buildCssBlock(entries);
            fs.appendFileSync(cssFile, block);

            try {
              const firstEntry = entries[0];
              const msg = firstEntry?.note
                ? `style(DevInspector): ${firstEntry.selector} — ${firstEntry.note}`
                : `style(DevInspector): ${firstEntry?.selector ?? 'multi-selectors'}`;
              execSync(`cd "${projectRoot}" && git add ${commitTargetFile} && git commit -m ${JSON.stringify(msg)} --allow-empty`, { stdio: 'pipe' });
            } catch {}

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });

      server.middlewares.use('/__dev/submit-style-intent', (req: any, res: any) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (c: any) => body += c);
        req.on('end', () => {
          try {
            const payload = JSON.parse(body);
            const entry = appendStyleInbox(payload);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, entry, ...getStyleIntentSummary() }));
          } catch (e) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });

      server.middlewares.use('/__dev/style-intents/delete', (req: any, res: any) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (c: any) => body += c);
        req.on('end', () => {
          try {
            const payload = JSON.parse(body);
            const result = deleteStyleIntent(payload);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (e) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });

      server.middlewares.use('/__dev/style-intents', (req: any, res: any) => {
        if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
        try {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, ...getStyleIntentSummary() }));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: String(e) }));
        }
      });
    },
  };
}

export function createDevHandoffPlugin(projectRoot: string) {
  return {
    name: 'dev-handoff',
    configureServer(server: any) {
      server.middlewares.use('/__dev/handoff', (req: any, res: any) => {
        const url = new URL(req.url, 'http://localhost');
        const includeCode = url.searchParams.get('code') !== '0';
        const includeProduct = url.searchParams.get('product') !== '0';
        const includeDesign = url.searchParams.get('design') !== '0';

        const projectName = path.basename(projectRoot);
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-'));

        try {
          const excludes: string[] = [
            'node_modules/', 'dist/', '.git/', '.DS_Store',
            'src/dev/', 'CLAUDE.md', 'AGENTS.md',
            '*_TEMPLATE.md', '*_PROMPT.md',
            'README.md',
            'docs/MEMORY_RULES.md', 'docs/USER_CONTEXT.md',
            'docs/HANDOFF.md', 'docs/LESSONS.md',
          ];

          if (!includeCode) excludes.push('src/');
          if (!includeDesign) excludes.push('docs/design/');
          if (!includeProduct && !includeDesign) {
            excludes.push('docs/');
          } else if (!includeProduct) {
            ['CHANGELOG.md', 'CODE_STRUCTURE.md', 'DECISIONS.md',
             'DESIGN_STANDARDS.md', 'PRODUCT_PLAN.md', 'PROJECT.md']
              .forEach((file) => excludes.push(`docs/${file}`));
          }

          const flags = excludes.map((exclude) => `--exclude='${exclude}'`).join(' ');
          execSync(`rsync -a ${flags} "${projectRoot}/" "${copyDir}/"`);

          if (includeCode) {
            const mainTsx = path.join(copyDir, 'src', 'main.tsx');
            const stripScript = path.join(os.homedir(), '.claude/skills/handoff/scripts/strip_dev_block.py');
            if (fs.existsSync(mainTsx) && fs.existsSync(stripScript)) {
              execSync(`python3 "${stripScript}" "${mainTsx}"`);
            }
          }

          const desktop = path.join(os.homedir(), 'Desktop');
          const filename = `${projectName}_handoff_${date}.zip`;
          const destZip = path.join(desktop, filename);

          execSync(`cd "${copyDir}" && zip -r "${destZip}" . -x "*.DS_Store"`, { stdio: 'pipe' });

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, path: destZip }));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: String(e) }));
        } finally {
          try { execSync(`rm -rf "${copyDir}"`); } catch {}
        }
      });

      server.middlewares.use('/__dev/reveal', (req: any, res: any) => {
        const url = new URL(req.url, 'http://localhost');
        const filePath = url.searchParams.get('path') ?? '';
        try {
          execSync(`open -R "${filePath}"`);
          res.end('ok');
        } catch {
          res.statusCode = 500;
          res.end('error');
        }
      });
    },
  };
}
