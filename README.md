# Cascading Picklists Extension

This extension provides cascading and derived work item fields in Azure DevOps.

It now supports a feature-catalogue workflow where users select:
- `Module` -> filtered `Feature Name`

Then the extension automatically derives:
- `Feature ID`
- derived `Category`
- `System.AreaPath`

The mapping is generated from an Excel catalogue and stored as JSON in the repo.

## What This Solves

The feature-catalogue flow enforces consistent ticket metadata without forcing users to manually maintain dependent fields.

Benefits:
- Prevents invalid `Feature Name` values by filtering them by `Module`.
- Keeps reporting fields (`Feature ID`, derived `Category`) consistent.
- Standardizes `AreaPath` assignment from feature-level mapping.
- Handles ambiguous modules (for example `Actions on Mobile App`) by deriving from the selected feature leaf, not only module.

## High-Level Architecture

Main runtime files:
- `src/common/cascading.service.ts`
- `src/common/feature-catalogue.ts`
- `src/common/mappings/feature-catalogue.mapping.json`
- `src/observer/index.ts`

How it works at runtime:
1. Work item form loads and the extension initializes.
2. `CascadingFieldsService` loads the feature catalogue mapping JSON.
3. On `Custom.Module` change:
   - filter allowed values for `Custom.FeatureName`
   - clear `Custom.FeatureName`
   - clear `Custom.FeatureID`
   - apply module defaults for derived `Custom.Category` and `System.AreaPath` (only if defaults are unambiguous)
4. On `Custom.FeatureName` change:
   - resolve exact leaf mapping under selected module
   - set `Custom.FeatureID`
   - set derived `Custom.Category`
   - set `System.AreaPath`
5. Existing generic manifest-driven cascade logic still runs for other configured cascades.

## Azure DevOps Field Setup (Required)

This repo provides form behavior only. You still need to configure process fields in Azure DevOps.

Create/update these fields in your process:

1. `Module`
- Reference name: `Custom.Module`
- Type: picklist (string)
- Required: yes
- Editable: yes
- Allowed values: unique `Product Module` values from the catalogue (currently 13)

2. `Feature Name`
- Reference name: `Custom.FeatureName`
- Type: picklist (string)
- Required: yes
- Editable: yes
- Allowed values: full superset of all feature names (extension applies runtime filtering by module)

3. `Feature ID`
- Reference name: `Custom.FeatureID`
- Type: string
- Editable: no (or hide/disable in form)
- Used for reporting

4. Derived `Category`
- Reference name: `Custom.Category`
- Type: string or picklist (depending on reporting requirements)
- Editable: no (or hide/disable)
- Filled by extension from feature leaf mapping

5. Existing ticket category/source field
- Rename/replace manual field to `Source` in process/UI as needed
- Keep manual options and preserve historical values
- Do not wire this manual `Source` field into automation

6. Area Path
- System field: `System.AreaPath`
- Extension updates this automatically from feature leaf mapping
- If feature is not chosen yet, module defaults may apply when unambiguous

## Mapping Model

The generated mapping lives at:
- `src/common/mappings/feature-catalogue.mapping.json`

Shape:

```json
{
  "generatedAtUtc": "2026-02-27T08:00:14.7787812Z",
  "sourceFile": "C:\\Users\\...\\Feature's catalogue (1).xlsx",
  "modules": {
    "Rental": {
      "features": {
        "Rental Contract": {
          "featureId": "RENT-007",
          "category": "Rental",
          "area": "Modules"
        }
      },
      "defaults": {
        "category": "Rental",
        "area": "Modules"
      }
    }
  }
}
```

Rules:
- `modules.<module>.features.<feature>` is the source of truth for derived fields.
- Module defaults are optional and used only when feature is not selected.
- Leaf mapping always wins over defaults.

## Excel -> JSON Generator

Generator script:
- `scripts/generate-feature-catalogue-mapping.ps1`

It reads the first worksheet and requires these columns:
- `Feature ID`
- `Category`
- `Feature Name`
- `Product Module`
- `Area`

What it does:
- Groups rows by `Product Module`
- Creates `features` map under each module
- Computes module defaults only when category/area are unambiguous
- Writes JSON to the target path

## Local Development Guide

Prerequisites:
- Node.js and npm
- PowerShell (Windows)
- Excel installed locally (script uses Excel COM automation)

Install dependencies:

```bash
npm install
```

Regenerate mapping from catalogue:

```bash
npm run generate:feature-catalogue-mapping
```

Run unit tests:

```bash
npm run test:unit
```

Build extension bundles:

```bash
npm run build-dev
```

Run extension locally:

```bash
npm run start
```

## Testing

Unit tests are in:
- `tests/feature-catalogue.test.ts`

Covered cases:
- `Feature Name` is filtered by selected `Module`
- Leaf mapping autofills `Feature ID`, `Category`, and `Area`
- Ambiguous module case (`Actions on Mobile App`) resolves category from leaf mapping (`Support` vs `CMMS` etc.)

## Operational Notes

- The extension does not create ADO fields automatically.
- Field security/editability (read-only/hidden) is managed in process/form configuration.
- `Feature Name` filtering depends on `getAllowedFieldValues` + `filterAllowedFieldValues` behavior in work item form APIs.
- If `Feature Name` is empty, `Feature ID` is cleared and module defaults may be applied.

## Troubleshooting

`Custom.FeatureName` does not filter:
- Confirm field reference names exactly match:
  - `Custom.Module`
  - `Custom.FeatureName`
  - `Custom.FeatureID`
  - `Custom.Category`
- Ensure `Feature Name` is a picklist with all values available.

Derived fields not updating:
- Verify selected feature exists in generated JSON under selected module.
- Regenerate mapping after catalogue changes.
- Rebuild and redeploy extension bundle.

Generator script fails:
- Ensure Excel is installed and workbook path is valid.
- Ensure required header names in the first worksheet are unchanged.

Unexpected `AreaPath`:
- Check leaf mapping first.
- Check module defaults only for pre-feature state.
- Confirm area values match valid project area paths.

## Documentation and References

- Marketplace extension page: https://marketplace.visualstudio.com/items?itemName=ms-devlabs.cascading-picklists-extension
- Azure DevOps extension work item forms: https://learn.microsoft.com/en-us/azure/devops/extend/develop/add-workitem-extension?view=azure-devops
- Azure DevOps extension development overview: https://learn.microsoft.com/en-us/azure/devops/extend/get-started

## Support

Use the repository issues tracker for bugs and feature requests:
- https://github.com/microsoft/azure-devops-extension-cascading-picklist/issues

## Contributing

Contributions are welcome via pull requests.

Do not publish a public clone of this extension under a different publisher; use a private extension if you need a forked internal variant.
