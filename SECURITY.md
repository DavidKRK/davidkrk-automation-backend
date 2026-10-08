# Security Policy

## Supported Versions

This repository does not publish versioned releases. Security updates are
supported on the current `main` branch only.

| Branch | Supported          |
| ------ | ------------------ |
| main   | :white_check_mark: |
| other  | :x:                |

## Reporting a Vulnerability

If you discover a potential security issue in this project, please notify
AWS/Amazon Security via the [vulnerability reporting page](https://aws.amazon.com/security/vulnerability-reporting/).
Please do **not** create a public GitHub issue.

## Temporary Audit Exceptions

This repository enforces CI blocking for **high/critical direct vulnerabilities**.

Temporary exceptions are tracked in:
- `.github/security/audit-exceptions.json`

Active exceptions are reviewed weekly by the upstream monitor and must have:
- owner,
- advisory,
- linked issue,
- expiry date,
- explicit justification,
- a concrete removal plan tied to the upstream fix or disappearance of the advisory.

If the targeted vulnerability disappears from audit results, the exception must be removed immediately.
The weekly upstream monitor reports the removal plan and available upstream versions so the owner can test an upgrade and remove the exception and related Dependabot ignore. On expiry, CI fails until the exception is removed or renewed with explicit justification and a new expiry date.

Important: this repository currently contains temporary exception entries for direct Amplify vulnerabilities while upstream fixes are pending. These exceptions are not permanent and should be treated as a temporary risk accepted only under the tracked process above.
