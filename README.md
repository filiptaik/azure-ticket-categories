# Cascading Picklists Extension

This extension provides cascading and derived work item fields in Azure DevOps.

It now supports a feature-catalogue workflow where users select:
- `Module` -> filtered `Feature Name`

Then the extension automatically derives:
- `Feature ID`
- derived `Category`
- `System.AreaPath`

The mapping is generated from an Excel catalogue and stored as JSON in the repo.
The same mapping can also be stored directly in the project manifest in Azure DevOps for rapid updates without extension rebuilds.

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

## Configurable Field References (No Hardcoded IDs Required)

Feature catalogue automation no longer requires fixed field IDs.  
You can configure all field refs in the extension manifest JSON saved in the project admin hub.

Manifest example:

```json
{
  "version": "1",
  "cascades": {},
  "featureCatalogue": {
    "fields": {
      "module": "Custom.ProductModule",
      "featureName": "Custom.ProductFeature",
      "featureId": "Custom.ProductFeatureId",
      "category": "Custom.DerivedProductCategory",
      "areaPath": "System.AreaPath"
    },
    "mapping": {
      "modules": {}
    }
  }
}
```

Notes:
- If `featureCatalogue.fields` is omitted, defaults are used:
  - `Custom.Module`
  - `Custom.FeatureName`
  - `Custom.FeatureID`
  - `Custom.Category`
  - `System.AreaPath`
- You can mix custom and default refs (only override fields you need).
- `featureCatalogue.mapping` is optional. If omitted, bundled repo mapping is used.

## Mapping Model

Generated mapping file in repo:
- `src/common/mappings/feature-catalogue.mapping.json`

Runtime precedence:
1. `featureCatalogue.mapping` from project manifest (configured in ADO hub)
2. Fallback bundled mapping file above

This means mapping-only changes can be made in ADO config hub and take effect without publishing a new extension package.

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

### Using generated mapping without rebuilding extension

After generating `feature-catalogue.mapping.json`, copy its `modules` object into the project manifest under `featureCatalogue.mapping`:

```json
{
  "version": "1",
  "cascades": {},
  "featureCatalogue": {
    "fields": {
      "module": "Custom.ProductModule",
      "featureName": "Custom.ProductFeature",
      "featureId": "Custom.ProductFeatureId",
      "category": "Custom.DerivedProductCategory",
      "areaPath": "System.AreaPath"
    },
    "mapping": {
      "modules": {
        "Rental": {
          "features": {
            "Rental Contract": {
              "featureId": "RENT-007",
              "category": "Rental",
              "area": "Modules"
            }
          }
        }
      }
    }
  }
}
```

Save in the hub. No extension rebuild/redeploy is required for mapping-only updates.

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

## End-to-End Setup and Example Flow

This section walks through the full test cycle in Azure DevOps from extension packaging to creating a real work item and validating behavior.

### 1. Update source catalogue and regenerate mapping

1. Update the Excel catalogue used as source of truth.
2. Regenerate mapping JSON:

```bash
npm run generate:feature-catalogue-mapping
```

3. Confirm mapping file changed as expected:
- `src/common/mappings/feature-catalogue.mapping.json`
- Verify target module/feature entries exist and contain expected `featureId`, `category`, and `area`.
4. Copy mapping into ADO manifest (`featureCatalogue.mapping.modules`) and save.

If you only changed mapping data (not extension code), stop here and test in work items.
No rebuild/package/upload is needed.

### 2. Prepare the extension package

From the repo root:

```bash
npm install
npm run test:unit
npm run build-dev
npm run package-dev
```

Expected result:
- A `.vsix` file is generated in the repository root.

Use this step only when extension code changed.

### 3. Install extension into Azure DevOps org

1. Go to Azure DevOps `Organization settings` -> `Extensions` -> `Manage extensions`.
2. Select `Upload extension`.
3. Upload the `.vsix` created above.
4. Install it to your target organization.

If upload fails due to version conflict:
1. Increase `version` in `azure-devops-extension.json`.
2. Run `npm run build-dev` and `npm run package-dev` again.
3. Upload the new `.vsix`.

### 4. Create/verify process fields

In your inherited process, create fields that you want to use.

Recommended field set:
- Module field (picklist, required)
- Feature Name field (picklist, required)
- Feature ID field (string, read-only on form)
- Derived Category field (string/picklist, read-only on form)
- Source field (manual, not automated)

Important:
- `Feature Name` picklist must contain the superset of all feature names from mapping.
- Area paths referenced by mapping must exist in the project.

### 5. Add fields to work item form

1. Open process customization for your target work item type.
2. Add fields to the layout.
3. Set read-only/hidden behavior for derived fields (`Feature ID`, derived `Category`) per your policy.
4. Keep manual `Source` editable.

### 6. Configure extension manifest in project hub

1. Open project admin hub `Feature Catalogue Automation`.
2. Paste/update manifest JSON with your field references.
3. Save configuration.

Example with custom refs:

```json
{
  "version": "1",
  "cascades": {},
  "featureCatalogue": {
    "fields": {
      "module": "Custom.ProductModule",
      "featureName": "Custom.ProductFeature",
      "featureId": "Custom.ProductFeatureId",
      "category": "Custom.DerivedProductCategory",
      "areaPath": "System.AreaPath"
    }
  }
}
```

### 7. Execute the example ticket flow

Open a new work item and follow this sequence:

1. Select module:
- Example: `Rental`
- Expected:
  - `Feature Name` list is filtered to rental features only
  - `Feature Name` value is cleared
  - `Feature ID` is cleared
  - derived `Category`/`AreaPath` may get module defaults if unambiguous

2. Select feature:
- Example: `Rental Contract`
- Expected:
  - `Feature ID` becomes `RENT-007`
  - derived `Category` becomes `Rental`
  - `AreaPath` becomes `Modules`

3. Validate ambiguous module behavior:
- Set module to `Actions on Mobile App`
- Choose feature `Case View`
  - Expected derived `Category`: `Support`
- Choose feature `Equipment Page`
  - Expected derived `Category`: `CMMS`

This confirms category is derived from leaf mapping, not from module alone.

### 8. Save and regression-check

1. Save the work item.
2. Refresh/reopen the item.
3. Confirm derived values remain consistent.
4. Change module again and verify dependent resets happen as expected.

### 9. Rollout checklist for production

1. Freeze mapping source workbook version.
2. Regenerate mapping JSON and commit.
3. Run unit tests and build.
4. Package and upload new `.vsix`.
5. Update process/forms and manifest config per project.
6. Smoke test with at least one scenario per major module.

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
