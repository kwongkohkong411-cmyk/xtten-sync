/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const docsDir = path.resolve(rootDir, '..', 'docs');
const reportPath = path.join(docsDir, 'rbac-enforcement-coverage.md');
const args = new Set(process.argv.slice(2));
const writeReport = args.has('--write-report');
const reportOnly = args.has('--report-only');

const allowedResolverFiles = new Set([
  normalize(path.join(srcDir, 'auth', 'rbac-core.service.ts')),
  normalize(path.join(srcDir, 'auth', 'base-rbac.service.ts')),
]);

function normalize(filePath) {
  return filePath.replace(/\\/g, '/');
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function countMatches(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function rel(filePath) {
  return normalize(path.relative(rootDir, filePath));
}

const files = walk(srcDir).filter((filePath) => filePath.endsWith('.ts'));
const serviceFiles = files.filter((filePath) => filePath.endsWith('.service.ts'));
const controllerFiles = files.filter((filePath) => filePath.endsWith('.controller.ts'));

const violations = [];
const stats = {
  totalServiceFiles: serviceFiles.length,
  baseExtendedServices: 0,
  protectedEndpointCount: 0,
  decisionAuditCallSites: 0,
  directAuditWrites: 0,
  resolverDefinitionViolations: 0,
  crossTenantBypassViolations: 0,
  baseExtensionViolations: 0,
  directCoreCallSites: 0,
};

const directAuditWriters = [];
const directCoreCallFiles = [];
const nonBaseServices = [];

for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'utf8');
  const normalizedFile = normalize(filePath);
  const relativePath = rel(filePath);

  if (filePath.endsWith('.controller.ts')) {
    stats.protectedEndpointCount += countMatches(content, /@RequirePermission\(/g);
  }

  stats.decisionAuditCallSites += countMatches(content, /recordPermissionDecision\(/g);
  const auditWrites = countMatches(content, /tenantAuditLog\.create\(/g);
  stats.directAuditWrites += auditWrites;
  if (auditWrites > 0) {
    directAuditWriters.push({ file: relativePath, count: auditWrites });
  }

  const directCoreCalls = countMatches(content, /\.rbacCore\.(resolveActorContext|resolveCompanyScope|assertCompanyScope|assertTenantAccess|applyScopeToQuery)\(/g);
  stats.directCoreCallSites += directCoreCalls;
  if (directCoreCalls > 0) {
    directCoreCallFiles.push({ file: relativePath, count: directCoreCalls });
  }

  const hasCustomResolver = /(?:private|protected|public)?\s*async\s+resolveActorContext\s*\(/.test(content);
  if (hasCustomResolver && !allowedResolverFiles.has(normalizedFile)) {
    stats.resolverDefinitionViolations += 1;
    violations.push(`${relativePath}: custom resolveActorContext() detected outside RBAC core/base`);
  }

  const hasCrossTenantThrow = /throw new ForbiddenException\(['"`]Cross-tenant/i.test(content);
  const isAllowedCrossTenantFile = normalizedFile === normalize(path.join(srcDir, 'auth', 'rbac-core.service.ts'));
  if (hasCrossTenantThrow && !isAllowedCrossTenantFile) {
    stats.crossTenantBypassViolations += 1;
    violations.push(`${relativePath}: direct Cross-tenant ForbiddenException detected; use RBAC enforcement API instead`);
  }
}

for (const filePath of serviceFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = rel(filePath);
  const normalizedFile = normalize(filePath);
  const isAnchorFile = allowedResolverFiles.has(normalizedFile);
  const touchesRbac = /RbacCoreService|assertTenantAccess\(|assertCompanyScope\(|applyScopeToQuery\(|resolveCompanyScope\(|recordPermissionDecision\(/.test(content);
  const extendsBase = /extends\s+BaseRbacService/.test(content);

  if (extendsBase) {
    stats.baseExtendedServices += 1;
  }

  if (!isAnchorFile && touchesRbac && !extendsBase) {
    stats.baseExtensionViolations += 1;
    nonBaseServices.push(relativePath);
    violations.push(`${relativePath}: RBAC-aware service must extend BaseRbacService`);
  }
}

const report = [
  '# RBAC Enforcement Coverage',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Coverage Summary',
  '',
  `- Service files: ${stats.totalServiceFiles}`,
  `- Services extending BaseRbacService: ${stats.baseExtendedServices}`,
  `- Protected endpoints (@RequirePermission): ${stats.protectedEndpointCount}`,
  `- Permission decision audit call sites: ${stats.decisionAuditCallSites}`,
  `- Direct tenantAuditLog.create call sites: ${stats.directAuditWrites}`,
  `- Direct RBAC core call sites: ${stats.directCoreCallSites}`,
  '',
  '## Lockdown Violations',
  '',
  ...(violations.length ? violations.map((item) => `- ${item}`) : ['- None']),
  '',
  '## Direct Audit Writers',
  '',
  ...(directAuditWriters.length ? directAuditWriters.map((item) => `- ${item.file}: ${item.count}`) : ['- None']),
  '',
  '## Direct Core Call Sites',
  '',
  ...(directCoreCallFiles.length ? directCoreCallFiles.map((item) => `- ${item.file}: ${item.count}`) : ['- None']),
  '',
  '## Non-Base RBAC Services',
  '',
  ...(nonBaseServices.length ? nonBaseServices.map((item) => `- ${item}`) : ['- None']),
  '',
].join('\n');

if (writeReport) {
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`RBAC coverage report written to ${reportPath}`);
}

if (violations.length) {
  console.error('RBAC lockdown violations found:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  if (!reportOnly) {
    process.exit(1);
  }
}

console.log('RBAC lockdown scan passed.');
