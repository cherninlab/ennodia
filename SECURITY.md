# Security Policy

## Supported Versions

Only the latest release line receives security fixes.

## Reporting a Vulnerability

Report vulnerabilities privately through GitHub:
<https://github.com/cherninlab/ennodia/security/advisories/new>

Do not open public issues for security reports. Expect an initial
response within a few days.

## Scope Notes

Ennodia starts local agent CLIs as child processes and never adds
permission-bypass flags by default. Reports are especially welcome for:

- any path that causes a child harness to run with broader permissions
  than its adapter declares
- prompt-injection paths through the Compare judge/synthesizer pipeline
- data leaving the machine other than through a harness's own provider
  traffic
- Ennodia IO authentication or binding weaknesses

Do not commit credentials while reproducing an issue. If a secret leaks
during testing, rotate it before reporting.
