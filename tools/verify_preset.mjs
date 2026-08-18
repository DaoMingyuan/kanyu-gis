/**
 * 发现库同款可加载性校验（旁路复跑工具，「无冗余文件」铁律下的已声明受控例外）。
 * 依赖全部来自宿主检出目录（DSH npm 缓存检出）：
 *   - @deepseek-ai/cordis-plugin-include —— entryListSchema（js-yaml JSON_SCHEMA + !!js/*
 *     标签，即 discovery.js:91 传给 yaml.load 的同一对象）
 *   - @deepseek-ai/dsh-agent-presets —— readPresetMetadata（preset.yml 元数据判定）
 * 判定链与发现时完全同路径：解析 → entryListSchema.safeParse → readPresetMetadata。
 * 用法：node verify_preset.mjs --preset-dir <root> | node verify_preset.mjs <preset.yml> [agent.cordis.yml] ...
 * 退出码 0 = 全部可挂载；1 = 存在问题；2 = 用法错误。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { sep } from 'node:path';
import jsyaml from 'file:///C:/Users/Administrator/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/js-yaml/dist/js-yaml.js';
import * as include from 'file:///C:/Users/Administrator/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/cordis-plugin-include/lib/index.js';
import * as dsh from 'file:///C:/Users/Administrator/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh-agent-presets/lib/index.js';

const { load, JSON_SCHEMA } = jsyaml;
const { entryListSchema } = include;
const { readPresetMetadata } = dsh;

const ID_RE = /^[a-z0-3][a-z0-9-]*$/;

function shapeIssue(doc) {
  if (!Array.isArray(doc)) return 'composition root must be an array of rows';
  if (doc.length === 0) return 'composition root is empty';
  const counts = new Map();
  for (const key of Object.keys(doc)) {
    const n = doc.filter(r => r && Object.prototype.hasOwnProperty.call(r, key)).length;
    if (n > 1) return `top-level key "${key}" appears on ${n} rows`;
    counts.set(key, n);
  }
  const ids = doc.map(r => r?.id).filter(id => id !== undefined);
  if (new Set(ids).size !== ids.length && ids.length) return 'two rows share an id';
  for (const row of doc) {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) {
      return `a row is ${Array.isArray(row) ? 'an array' : String(row)}`;
    }
    if (ID_RE.test(String(row?.id)) === false) {
      return `row id ${JSON.stringify(row.id)} does not match the preset id pattern`;
    }
    if (row.group === true) {
      if (!Array.isArray(row.config)) return `group row ${row.id} holds no config row list`;
      for (const sub of row.config) {
        if (typeof sub?.id !== 'string' || !ID_RE.test(sub.id)) {
          return `group ${row.id} holds a member with id ${JSON.stringify(sub?.id)}`;
        }
      }
      if (new Set(row.config.map(c => c?.id)).size !== row.config.length) {
        return `group ${row.id} holds duplicate member ids`;
      }
    }
    // config 在非 group 行上是普通配置对象（如 defaultMode），合法；
    // 仅当它是“行列表”（数组）时才属于越位的组成员配置。
    if (row.group !== true && Array.isArray(row.config)) {
      return `row ${row.id} carries a config row list outside a group`;
    }
    if (Object.prototype.hasOwnProperty.call(row, 'services') || Object.prototype.hasOwnProperty.call(row, 'tools')) {
      return `row ${row.id} carries composition-level ${'services,tools'.includes(key) ? 'services' : 'tools'}; presets name plugins only`;
    }
  }
  return null;
}

function walkRows(doc, label = '') {
  const issues = [];
  const seen = new Map();
  const walk = (rows, prefix) => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const label2 = prefix ? `${prefix}[${i}]` : String(i);
      if (row == null || typeof row !== 'object' || Array.isArray(row)) {
        issues.push(`${label2}: not a row object`);
        continue;
      }
      if (row.id !== undefined && row.id !== null && ID_RE.test(String(row.id)) === false) {
        issues.push(`${label2} (${JSON.stringify(row.id)}): id leaves the pattern`);
      }
      if (row.patch !== undefined) {
        if (Array.isArray(row.patch)) {
          issues.push(`${label2} (${JSON.stringify(label2)}): static patch rows are inert — presets mount from the row list; patches only apply in an overlay composition`);
        }
      }
      if (row.isolate) {
        if (typeof row.isolate !== 'object' || row.isolate === null || Array.isArray(row.isolate)) {
          issues.push(`${label2}: isolate realm is not an object`);
        }
      }
      if (row.group === true) {
        if (!Array.isArray(row.config)) {
          issues.push(`${label2} (group): holds no config row list`);
        } else {
          const ids = row.config.map(c => c?.id);
          if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || ID_RE.test(id) === false)) {
            issues.push(`${label2} (group): member id missing or out of pattern (${JSON.stringify(ids)})`);
          }
          walk(row.config, `${label2}.config`);
        }
      }
    }
  };
  walk(doc, 'row');
  return issues;
}

async function main() {
  const args = process.argv.slice(2);
  let inputs = [];
  if (args.length >= 2 && args[0] === '--preset-dir') {
    const root = args[1];
    let entries;
    try { entries = readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()); }
    catch (err) { console.log(`cannot read preset directory ${root}: ${err.message ?? err}`); process.exit(2); }
    inputs = entries.flatMap(d => {
      const base = [root, d.name].join(sep);
      let files;
      try { files = readdirSync(base); } catch (err) {
        console.log(`cannot read preset ${base}: ${err.message ?? err}`);
        return [];
      }
      return files.filter(f => f.endsWith('.yml') || f.endsWith('.yaml')).map(f => [base, f].join(sep));
    });
  } else {
    inputs = args;
    if (inputs.length === 0) { console.log('usage: --preset-dir <root> or explicit file paths'); process.exit(2); }
  }

  let problems = 0;
  const report = [];
  for (const file of inputs) {
    let content;
    try {
      if (!statSync(file).isFile()) { content = null; } else { content = readFileSync(file, 'utf8'); }
    } catch { content = null; }
    const isPreset = /preset\.yml$/i.test(file);
    const isAgent = !isPreset;
    if (content === null) {
      problems++;
      report.push(`✗ ${file}: unreadable${isAgent ? ' (an agent.cordis.yml)' : ''}`);
      continue;
    }
    // 与发现库同路径：entryListSchema 是 js-yaml 的 Schema 对象
    // （JSON_SCHEMA + !!js/* 标签，见 discovery.js:91），不是 zod schema——
    // 可加载性 = yaml.load 在该 schema 下解析成功；!!js/* 节点按宿主语义求值。
    let parsed;
    try {
      parsed = load(content, { schema: entryListSchema, maxContentLength: 1 * 1024 * 1024 });
    } catch (err) {
      problems++;
      report.push(`✗ ${file}: YAML parse failed -- ${err.message ?? err}`);
      continue;
    }
    if (parsed === undefined) {
      problems++;
      report.push(`✗ ${file}: YAML parse produced no document`);
      continue;
    }
    // shape/walk 校验只针对组合文件（agent.cordis.yml 等行数组）；
    // preset.yml 是发现元数据（{name, description} 映射），走 readPresetMetadata。
    let shape = null;
    let walkIssues = [];
    if (isAgent) {
      shape = shapeIssue(parsed);
      if (shape) {
        problems++;
        report.push(`✗ ${file}: shape problem -- ${shape}`);
      }
      walkIssues = walkRows(parsed);
      if (walkIssues.length) {
        problems++;
        report.push(`✗ ${file}: ${walkIssues.length} row walk issues:\n${walkIssues.map(s => '    ' + s).join('\n')}`);
      }
    }
    if (isPreset) {
      let meta;
      try { meta = await readPresetMetadata(file); }
      catch (err) { meta = { broken: [String(err?.message ?? err)] }; }
      if (meta.broken !== undefined && meta.broken !== null && (Array.isArray(meta.broken) ? meta.broken.length > 0 : true)) {
        problems++;
        report.push(`✗ ${file}: readPresetMetadata rejected -- ${Array.isArray(meta.broken) ? meta.broken.join(' | ') : meta.broken}`);
      }
    }
    if (!shape && walkIssues.length === 0) {
      report.push(isPreset
        ? `✓ ${file} OK ${JSON.stringify(parsed)}`
        : `✓ ${file} OK (${(Array.isArray(parsed) ? parsed : []).filter(r => r?.group === true).length} group rows / ${(Array.isArray(parsed) ? parsed : []).filter(r => r?.group !== true).length} direct rows)`);
    }
  }
  console.log(report.join('\n\n'));
  console.log(problems === 0 ? '\nALL FILES LOADABLE' : `\n${problems} problem(s)`);
  process.exit(problems === 0 ? 0 : 1);
}

main();
