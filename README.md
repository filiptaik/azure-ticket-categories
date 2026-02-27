# Dynamic Cascading Fields (Azure DevOps)

This extension provides a generic pattern for:
- filtering one picklist based on another
- auto-filling additional fields from the selected leaf value

You can use it for many scenarios, for example:
- Product Line -> Feature
- Region -> Site
- Service Type -> Subtype
- Department -> Team

Mapping can be edited directly in Azure DevOps, so mapping-only updates do not require rebuilding/redeploying the extension.

## Start-To-Finish Setup Guide

### 1. Create ADO fields

Create these fields in your inherited process (use your own reference names):
- Parent field (picklist string)
- Child field (picklist string)
- Derived ID field (string)
- Derived category/type field (string or picklist)
- Optional derived path field (`System.AreaPath` or your own string field)

Example refs:
- `Custom.ParentField`
- `Custom.ChildField`
- `Custom.DerivedIdField`
- `Custom.DerivedCategoryField`
- `System.AreaPath`

### 2. Add field values

Populate picklist values in your process:
- Parent field: all parent options (for example `Region A`, `Region B`)
- Child field: superset of all child options across all parents

Notes:
- Child filtering is done by extension at runtime.
- If child values are missing from the picklist definition, they cannot be selected.

### 3. Get extension

Install/publish the extension into your Azure DevOps organization.

Then open:
- Project Settings -> `Feature Catalogue Automation` hub

### 4. Configure manifest

Paste/save manifest JSON in the hub.

```json
{
  "version": "1",
  "cascades": {},
  "featureCatalogue": {
    "fields": {
      "module": "Custom.ParentField",
      "featureName": "Custom.ChildField",
      "featureId": "Custom.DerivedIdField",
      "category": "Custom.DerivedCategoryField",
      "areaPath": "System.AreaPath"
    },
    "mapping": {
      "modules": {
        "Parent Value A": {
          "features": {
            "Child Value 1": {
              "featureId": "ID-001",
              "category": "Category-A",
              "area": "Path\\AreaA"
            },
            "Child Value 2": {
              "featureId": "ID-002",
              "category": "Category-B",
              "area": "Path\\AreaB"
            }
          },
          "defaults": {
            "category": "Category-A",
            "area": "Path\\AreaA"
          }
        }
      }
    }
  }
}
```

Quick check:
1. Open a work item.
2. Set parent.
3. Confirm child list is filtered.
4. Set child.
5. Confirm derived fields auto-fill.

### 5. Update mapping later

For rapid business changes (no rebuild/redeploy):
1. Open `Feature Catalogue Automation` hub.
2. Edit `featureCatalogue.mapping.modules`.
3. Save.
4. Refresh work item form.

Changes take effect immediately.

## Core Concept

The extension works with a parent-child structure:
- parent field (example: `Module`)
- child field (example: `Feature Name`)
- derived fields (example: ID, Category, AreaPath, etc.)

At runtime:
1. Parent changes -> child allowed values are filtered.
2. Child changes -> derived fields are auto-populated from leaf mapping.

## Where To Configure In ADO

1. Open your project in Azure DevOps.
2. Go to Project Settings.
3. Open admin hub `Feature Catalogue Automation`.
4. Edit and save manifest JSON.

## Universal Manifest Template

Use this as a starting point:

```json
{
  "version": "1",
  "cascades": {},
  "featureCatalogue": {
    "fields": {
      "module": "Custom.ParentField",
      "featureName": "Custom.ChildField",
      "featureId": "Custom.DerivedIdField",
      "category": "Custom.DerivedCategoryField",
      "areaPath": "System.AreaPath"
    },
    "mapping": {
      "modules": {
        "Parent Value A": {
          "features": {
            "Child Value 1": {
              "featureId": "ID-001",
              "category": "Category-A",
              "area": "Path\\AreaA"
            },
            "Child Value 2": {
              "featureId": "ID-002",
              "category": "Category-B",
              "area": "Path\\AreaB"
            }
          },
          "defaults": {
            "category": "Category-A",
            "area": "Path\\AreaA"
          }
        }
      }
    }
  }
}
```

Replace field reference names and values with your own.

## How To Update Mapping Later

1. Open `Feature Catalogue Automation` hub.
2. Edit `featureCatalogue.mapping.modules`.
3. Save.
4. Refresh the work item form.

Changes take effect immediately for mapping behavior.

## Mapping Rules

- Add a parent: add object under `modules`.
- Add a child: add object under `modules.<Parent>.features`.
- Update derived values: edit leaf object fields.
- Remove a child: delete leaf entry.

Precedence:
- Leaf values win (`features.<child>`).
- `defaults` are used only when child is empty/not selected.

## Field Reference Configuration

Set your actual field refs in `featureCatalogue.fields`.

Example:

```json
"fields": {
  "module": "Custom.Region",
  "featureName": "Custom.Site",
  "featureId": "Custom.SiteCode",
  "category": "Custom.SiteType",
  "areaPath": "System.AreaPath"
}
```

## Optional Excel Workflow

If you maintain mapping in Excel, you can generate mapping JSON locally:

```bash
npm run generate:feature-catalogue-mapping
```

Generated file:
- `src/common/mappings/feature-catalogue.mapping.json`

Copy the generated `modules` object into:
- `featureCatalogue.mapping.modules` in ADO hub JSON.

## Quick Validation

1. Open/create a work item.
2. Select a parent value.
3. Verify child list is filtered.
4. Select a child value.
5. Verify derived fields are auto-filled correctly.

## Runtime Source Priority

1. Mapping from ADO manifest (`featureCatalogue.mapping`)
2. Bundled mapping file fallback
