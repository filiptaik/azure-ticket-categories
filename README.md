# Feature Catalogue Automation (Azure DevOps)

This extension lets users pick:
- `Module` -> filtered `Feature Name`

Then it auto-fills:
- `Feature ID`
- derived `Category`
- `AreaPath`

Most important: you can manage mapping directly in Azure DevOps (no rebuild needed for mapping-only changes).

## Where To Configure In ADO

1. Open your project in Azure DevOps.
2. Go to Project Settings.
3. Open the admin hub named `Feature Catalogue Automation`.
4. Paste/save manifest JSON.

## Minimal Working Manifest (Copy/Paste)

Use this template first:

```json
{
  "version": "1",
  "cascades": {},
  "featureCatalogue": {
    "fields": {
      "module": "Custom.Module",
      "featureName": "Custom.FeatureName",
      "featureId": "Custom.FeatureID",
      "category": "Custom.Category",
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
            },
            "Rental Planner Board": {
              "featureId": "RENT-005",
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
  }
}
```

## How To Modify Mapping Later (No Rebuild)

When business changes happen:
1. Open `Feature Catalogue Automation` hub in ADO.
2. Edit JSON under `featureCatalogue.mapping.modules`.
3. Save.
4. Refresh the work item form.

That is all. New mapping is active immediately.

## Editing Rules

- Add new module:
  - Add new object under `modules`.
- Add new feature:
  - Add new item under `modules.<ModuleName>.features`.
- Change Feature ID/Category/Area:
  - Edit values in that feature leaf object.
- Remove feature:
  - Delete that feature entry.
- Keep `fields` in sync with your real ADO field reference names.

Leaf value always wins:
- `category` and `area` are taken from selected feature leaf.
- `defaults` are only used before feature is selected (or when feature is empty/invalid).

## If Your Field IDs Are Different

Update only `featureCatalogue.fields`:

```json
"fields": {
  "module": "Custom.ProductModule",
  "featureName": "Custom.ProductFeature",
  "featureId": "Custom.ProductFeatureId",
  "category": "Custom.DerivedProductCategory",
  "areaPath": "System.AreaPath"
}
```

## Optional: Generate Mapping From Excel

If you maintain mapping in Excel, you can generate JSON locally:

```bash
npm run generate:feature-catalogue-mapping
```

Then copy generated `modules` content from:
- `src/common/mappings/feature-catalogue.mapping.json`

Paste it into ADO manifest under:
- `featureCatalogue.mapping.modules`

## Quick Test

1. Create/open a work item.
2. Set `Module = Rental`.
3. Confirm `Feature Name` list only shows Rental features.
4. Select `Feature Name = Rental Contract`.
5. Confirm auto-fill:
   - `Feature ID = RENT-007`
   - `Category = Rental`
   - `AreaPath = Modules`

## Notes

- Mapping from ADO manifest is used first.
- Bundled mapping file in extension is fallback only.
- Mapping-only updates do not require packaging/uploading a new extension.
