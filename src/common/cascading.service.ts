import {
  CommonServiceIds,
  getClient,
  IProjectPageService,
} from 'azure-devops-extension-api/Common';
import { WorkItemField } from 'azure-devops-extension-api/WorkItemTracking/WorkItemTracking';
import { WorkItemTrackingRestClient } from 'azure-devops-extension-api/WorkItemTracking/WorkItemTrackingClient';
import { IWorkItemFormService } from 'azure-devops-extension-api/WorkItemTracking/WorkItemTrackingServices';
import * as SDK from 'azure-devops-extension-sdk';
import flatten from 'lodash/flatten';
import uniq from 'lodash/uniq';
import { CascadeConfiguration, CascadeMap, FieldOptions, ICascade } from './types';
import featureCatalogueMapping from './mappings/feature-catalogue.mapping.json';
import {
  getFeatureLeafMapping,
  getFeatureNamesForModule,
  getModuleDefaults,
  IFeatureCatalogueMapping,
} from './feature-catalogue';

type InvalidField = string;

class CascadingFieldsService {
  private static readonly moduleField = 'Custom.Module';
  private static readonly featureNameField = 'Custom.FeatureName';
  private static readonly featureIdField = 'Custom.FeatureID';
  private static readonly derivedCategoryField = 'Custom.Category';
  private static readonly areaPathField = 'System.AreaPath';

  private workItemService: IWorkItemFormService;
  private cascadeMap: CascadeMap;
  private featureCatalogue: IFeatureCatalogueMapping;

  public constructor(
    workItemService: IWorkItemFormService,
    cascadeConfiguration: CascadeConfiguration
  ) {
    this.workItemService = workItemService;
    this.cascadeMap = this.createCascadingMap(cascadeConfiguration);
    this.featureCatalogue = featureCatalogueMapping as IFeatureCatalogueMapping;
    this.applyFeatureCatalogueOnLoad();
  }

  private async applyFeatureCatalogueOnLoad(): Promise<void> {
    const featureName = await this.getFieldValue(CascadingFieldsService.featureNameField);
    if (featureName) {
      await this.performFeatureCatalogueCascading(CascadingFieldsService.featureNameField);
      return;
    }

    await this.performFeatureCatalogueCascading(CascadingFieldsService.moduleField);
  }

  private createCascadingMap(cascadeConfiguration: CascadeConfiguration): CascadeMap {
    const cascadeMap: CascadeMap = {};
    if (typeof cascadeConfiguration === 'undefined') {
      return cascadeMap;
    }
    //console.log('FIRST CASCADE MAP: ' + JSON.stringify(cascadeMap));

    Object.entries(cascadeConfiguration).forEach(([fieldName, fieldValues]) => {
      let alters: string[] = [];
      Object.values(fieldValues).forEach(cascadeDefinitions => {
        Object.keys(cascadeDefinitions).forEach(field => alters.push(field));
      });

      alters = uniq(alters);

      const cascade: ICascade = {
        alters,
        cascades: fieldValues,
      };

      cascadeMap[fieldName] = cascade;
    });
    //console.log('CASCADE MAP: ' + JSON.stringify(cascadeMap));
    return cascadeMap;
  }

  private async validateFilterOrClean(fieldReferenceName: string): Promise<boolean> {
    const allowedValues: string[] = await (this
      .workItemService as any).getFilteredAllowedFieldValues(fieldReferenceName);
    const fieldValue = (await this.workItemService.getFieldValue(fieldReferenceName, {
      returnOriginalValue: false,
    })) as string;
    if (!allowedValues.includes(fieldValue)) {
      return this.workItemService.setFieldValue(fieldReferenceName, '');
    }
  }

  public async resetAllCascades(): Promise<void[]> {
    const fields = flatten(Object.values(this.cascadeMap).map(value => value.alters));
    const fieldsToReset = new Set<string>(fields);
    fieldsToReset.add(CascadingFieldsService.featureNameField);

    return Promise.all(
      Array.from(fieldsToReset).map(async fieldName => {
        const values = await this.workItemService.getAllowedFieldValues(fieldName);
        await (this.workItemService as any).filterAllowedFieldValues(fieldName, values);
      })
    );
  }

  public async cascadeAll(): Promise<void[][]> {
    await this.applyFeatureCatalogueOnLoad();

    return Promise.all(
      Object.keys(this.cascadeMap).map(async field => this.performCascading(field))
    );
  }

  private async getFieldValue(fieldName: string): Promise<string> {
    const value = (await this.workItemService.getFieldValue(fieldName, {
      returnOriginalValue: false,
    })) as string;
    return value || '';
  }

  private async setDerivedCategoryAndArea(category?: string, area?: string): Promise<void> {
    await this.workItemService.setFieldValue(CascadingFieldsService.derivedCategoryField, category || '');
    if (area) {
      await this.workItemService.setFieldValue(CascadingFieldsService.areaPathField, area);
    }
  }

  private async filterFeatureNamesByModule(moduleName: string): Promise<void> {
    const allFeatureNames = (await this.workItemService.getAllowedFieldValues(
      CascadingFieldsService.featureNameField
    )) as string[];
    const allowedForModule = getFeatureNamesForModule(this.featureCatalogue, moduleName);
    const filtered = moduleName
      ? allFeatureNames.filter(value => allowedForModule.includes(value))
      : allFeatureNames;

    await (this.workItemService as any).filterAllowedFieldValues(
      CascadingFieldsService.featureNameField,
      filtered
    );
  }

  private async cascadeFromModule(): Promise<void> {
    const moduleName = await this.getFieldValue(CascadingFieldsService.moduleField);

    await this.filterFeatureNamesByModule(moduleName);
    await this.workItemService.setFieldValue(CascadingFieldsService.featureNameField, '');
    await this.workItemService.setFieldValue(CascadingFieldsService.featureIdField, '');

    const defaults = getModuleDefaults(this.featureCatalogue, moduleName);
    await this.setDerivedCategoryAndArea(defaults.category, defaults.area);
  }

  private async cascadeFromFeatureName(): Promise<void> {
    const moduleName = await this.getFieldValue(CascadingFieldsService.moduleField);
    const featureName = await this.getFieldValue(CascadingFieldsService.featureNameField);

    if (!moduleName || !featureName) {
      await this.workItemService.setFieldValue(CascadingFieldsService.featureIdField, '');
      const defaults = getModuleDefaults(this.featureCatalogue, moduleName);
      await this.setDerivedCategoryAndArea(defaults.category, defaults.area);
      return;
    }

    const leaf = getFeatureLeafMapping(this.featureCatalogue, moduleName, featureName);
    if (!leaf) {
      await this.workItemService.setFieldValue(CascadingFieldsService.featureIdField, '');
      const defaults = getModuleDefaults(this.featureCatalogue, moduleName);
      await this.setDerivedCategoryAndArea(defaults.category, defaults.area);
      return;
    }

    await this.workItemService.setFieldValue(CascadingFieldsService.featureIdField, leaf.featureId);
    await this.workItemService.setFieldValue(CascadingFieldsService.derivedCategoryField, leaf.category);
    await this.workItemService.setFieldValue(CascadingFieldsService.areaPathField, leaf.area);
  }

  private async performFeatureCatalogueCascading(changedFieldReferenceName: string): Promise<void> {
    if (changedFieldReferenceName === CascadingFieldsService.moduleField) {
      await this.cascadeFromModule();
      return;
    }

    if (changedFieldReferenceName === CascadingFieldsService.featureNameField) {
      await this.cascadeFromFeatureName();
    }
  }

  public async performCascading(changedFieldReferenceName: string): Promise<void[]> {
    if (
      changedFieldReferenceName === CascadingFieldsService.moduleField ||
      changedFieldReferenceName === CascadingFieldsService.featureNameField
    ) {
      await this.performFeatureCatalogueCascading(changedFieldReferenceName);
    }

    const changedFieldValue = (await this.workItemService.getFieldValue(changedFieldReferenceName, {
      returnOriginalValue: false,
    })) as string;
    // Ensure the changed field is the dependent field
    if (
      !Object.values(this.cascadeMap).some(cascade => {
        return Object.keys(cascade.cascades).some(parentValue => {
          return cascade.cascades[parentValue]?.hasOwnProperty(changedFieldReferenceName);
        });
      })
    ) {
      return;
    }

    // Find the parent field(s) affected by this dependent field
    const affectedParentFields = Object.keys(this.cascadeMap).filter(parentField => {
      return Object.values(this.cascadeMap[parentField].cascades).some(dependencies => {
        const allowedValues = dependencies[changedFieldReferenceName] as string[];
        return allowedValues?.includes(changedFieldValue);
      });
    });

    // Prepare allowed values for the parent fields
    const fieldValuesToFilter: FieldOptions = {};
    for (const parentField of affectedParentFields) {
      const cascade = this.cascadeMap[parentField];
      const matchingParentValues = Object.entries(cascade.cascades)
        .filter(([parentValue, dependencies]) => {
          const allowedDependentValues = dependencies[changedFieldReferenceName] as string[];
          return allowedDependentValues?.includes(changedFieldValue);
        })
        .map(([parentValue]) => parentValue);

      fieldValuesToFilter[parentField] = matchingParentValues;
    }

    // Apply filtering and auto-select the first allowed value
    return Promise.all(
      Object.entries(fieldValuesToFilter).map(async ([fieldName, allowedValues]) => {
        if (!Array.isArray(allowedValues)) {
          console.error(`Invalid allowedValues for field ${fieldName}:`, allowedValues);
          return;
        }

        const allValues = await this.workItemService.getAllowedFieldValues(fieldName);
        const filteredValues = allValues.filter(value => {
          if (typeof value !== 'string') {
            console.error(`Invalid value type in allowed values for field ${fieldName}:`, value);
            return false;
          }
          return allowedValues.includes(value);
        });

        await (this.workItemService as any).filterAllowedFieldValues(fieldName, filteredValues);

        // Auto-select the first allowed value, if any
        if (filteredValues.length > 0) {
          await this.workItemService.setFieldValue(fieldName, filteredValues[0]);
          console.log(`Auto-selected value for ${fieldName}: ${filteredValues[0]}`);
        } else {
          console.log(`No valid value to auto-select for ${fieldName}`);
        }

        await this.validateFilterOrClean(fieldName);
      })
    );
  }

  public async getconfigFieldValues() {
    await this.applyFeatureCatalogueOnLoad();
  }
}

interface ICascadeValidatorError {
  description: string;
}

class CascadeValidationService {
  private cachedFields: WorkItemField[];

  public async validateCascades(cascades: CascadeConfiguration): Promise<null | InvalidField[]> {
    const projectInfoService = await SDK.getService<IProjectPageService>(
      CommonServiceIds.ProjectPageService
    );
    const project = await projectInfoService.getProject();

    if (this.cachedFields == null) {
      const witRestClient = await getClient(WorkItemTrackingRestClient);
      const fields = await witRestClient.getFields(project.id);
      this.cachedFields = fields;
    }
    const fieldList = this.cachedFields.map(field => field.referenceName);

    // Check fields correctness for config root
    let invalidFieldsTotal = Object.keys(cascades).filter(field => !fieldList.includes(field));

    // Check fields on the lower level of config
    Object.values(cascades).map(fieldValues => {
      Object.values(fieldValues).map(innerFields => {
        const invalidFields = Object.keys(innerFields).filter(field => !fieldList.includes(field));
        invalidFieldsTotal = [...invalidFieldsTotal, ...invalidFields];
      });
    });

    if (invalidFieldsTotal.length > 0) {
      return invalidFieldsTotal;
    }

    return null;
  }
}

export { CascadingFieldsService, CascadeValidationService, ICascadeValidatorError };
