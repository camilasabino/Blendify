import { mkdir, readFile, writeFile } from 'node:fs/promises';

const reports = [
  ['apps/api', 'apps/api/coverage/lcov.info'],
  ['apps/web', 'apps/web/coverage/lcov.info'],
  ['packages/contracts', 'packages/contracts/coverage/lcov.info'],
];

const normalizedReports = await Promise.all(
  reports.map(async ([workspace, reportPath]) => {
    const report = await readFile(reportPath, 'utf8');

    return report.replace(/^SF:(.+)$/gm, (_, sourcePath) => {
      const normalizedPath = sourcePath.replaceAll('\\', '/');
      const repositoryPath = normalizedPath.startsWith(`${workspace}/`)
        ? normalizedPath
        : `${workspace}/${normalizedPath}`;

      return `SF:${repositoryPath}`;
    });
  }),
);

await mkdir('coverage', { recursive: true });
await writeFile('coverage/lcov.info', normalizedReports.join('\n'), 'utf8');
