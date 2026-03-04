import { IWorkItemFormService } from 'azure-devops-extension-api/WorkItemTracking/WorkItemTrackingServices';
import {
  IFeatureCatalogueConfiguration,
  IFeatureCatalogueFieldRefs,
} from './types';
import featureCatalogueMapping from './mappings/feature-catalogue.mapping.json';
import {
  getFeatureLeafMapping,
  getFeatureNamesForModule,
  getModuleDefaults,
  IFeatureCatalogueMapping,
} from './feature-catalogue';

class CascadingFieldsService {
  private static readonly defaultFeatureCatalogueFieldRefs = Object.freeze({
    module: 'Custom.Module',
    featureName: 'Custom.FeatureName',
    featureId: 'Custom.FeatureID',
    category: 'Custom.Category',
    areaPath: 'System.AreaPath',
  });

  private workItemService: IWorkItemFormService;
  private featureCatalogue: IFeatureCatalogueMapping;
  private featureFieldRefs: Required<IFeatureCatalogueFieldRefs>;

  public constructor(
    workItemService: IWorkItemFormService,
    featureCatalogueConfiguration?: IFeatureCatalogueConfiguration
  ) {
    this.workItemService = workItemService;
    this.featureCatalogue = this.resolveFeatureCatalogueMapping(featureCatalogueConfiguration);
    this.featureFieldRefs = {
      ...CascadingFieldsService.defaultFeatureCatalogueFieldRefs,
      ...(featureCatalogueConfiguration?.fields || {}),
    };
    this.applyFeatureCatalogueOnLoad();
  }

  private resolveFeatureCatalogueMapping(
    featureCatalogueConfiguration?: IFeatureCatalogueConfiguration
  ): IFeatureCatalogueMapping {
    const runtimeMapping = featureCatalogueConfiguration?.mapping;
    if (
      runtimeMapping &&
      typeof runtimeMapping === 'object' &&
      runtimeMapping.modules &&
      typeof runtimeMapping.modules === 'object'
    ) {
      return runtimeMapping;
    }

    return featureCatalogueMapping as IFeatureCatalogueMapping;
  }

  private async applyFeatureCatalogueOnLoad(): Promise<void> {
    const featureName = await this.getFieldValue(this.featureFieldRefs.featureName);
    if (featureName) {
      await this.performFeatureCatalogueCascading(this.featureFieldRefs.featureName);
      return;
    }

    await this.performFeatureCatalogueCascading(this.featureFieldRefs.module);
  }

  private async getFieldValue(fieldName: string): Promise<string> {
    const value = (await this.workItemService.getFieldValue(fieldName, {
      returnOriginalValue: false,
    })) as string;
    return value || '';
  }

  private async setDerivedCategoryAndArea(category?: string, area?: string): Promise<void> {
    await this.workItemService.setFieldValue(this.featureFieldRefs.category, category || '');
    if (area) {
      await this.workItemService.setFieldValue(this.featureFieldRefs.areaPath, area);
    }
  }

  private async filterFeatureNamesByModule(moduleName: string): Promise<void> {
    const allFeatureNames = (await this.workItemService.getAllowedFieldValues(
      this.featureFieldRefs.featureName
    )) as string[];
    const allowedForModule = getFeatureNamesForModule(this.featureCatalogue, moduleName);
    const filtered = moduleName
      ? allFeatureNames.filter(value => allowedForModule.includes(value))
      : allFeatureNames;

    await (this.workItemService as any).filterAllowedFieldValues(
      this.featureFieldRefs.featureName,
      filtered
    );
  }

  private async cascadeFromModule(): Promise<void> {
    const moduleName = await this.getFieldValue(this.featureFieldRefs.module);

    await this.filterFeatureNamesByModule(moduleName);
    await this.workItemService.setFieldValue(this.featureFieldRefs.featureName, '');
    await this.workItemService.setFieldValue(this.featureFieldRefs.featureId, '');

    const defaults = getModuleDefaults(this.featureCatalogue, moduleName);
    await this.setDerivedCategoryAndArea(defaults.category, defaults.area);
  }

  private async cascadeFromFeatureName(): Promise<void> {
    const moduleName = await this.getFieldValue(this.featureFieldRefs.module);
    const featureName = await this.getFieldValue(this.featureFieldRefs.featureName);

    if (!moduleName || !featureName) {
      await this.workItemService.setFieldValue(this.featureFieldRefs.featureId, '');
      const defaults = getModuleDefaults(this.featureCatalogue, moduleName);
      await this.setDerivedCategoryAndArea(defaults.category, defaults.area);
      return;
    }

    const leaf = getFeatureLeafMapping(this.featureCatalogue, moduleName, featureName);
    if (!leaf) {
      await this.workItemService.setFieldValue(this.featureFieldRefs.featureId, '');
      const defaults = getModuleDefaults(this.featureCatalogue, moduleName);
      await this.setDerivedCategoryAndArea(defaults.category, defaults.area);
      return;
    }

    await this.workItemService.setFieldValue(this.featureFieldRefs.featureId, leaf.featureId);
    await this.workItemService.setFieldValue(this.featureFieldRefs.category, leaf.category);
    await this.workItemService.setFieldValue(this.featureFieldRefs.areaPath, leaf.area);
  }

  private async performFeatureCatalogueCascading(changedFieldReferenceName: string): Promise<void> {
    if (changedFieldReferenceName === this.featureFieldRefs.module) {
      await this.cascadeFromModule();
      return;
    }

    if (changedFieldReferenceName === this.featureFieldRefs.featureName) {
      await this.cascadeFromFeatureName();
    }
  }

  public async performCascading(changedFieldReferenceName: string): Promise<void> {
    if (
      changedFieldReferenceName === this.featureFieldRefs.module ||
      changedFieldReferenceName === this.featureFieldRefs.featureName
    ) {
      await this.performFeatureCatalogueCascading(changedFieldReferenceName);
    }
  }

  public async getconfigFieldValues() {
    await this.applyFeatureCatalogueOnLoad();
  }
}
export { CascadingFieldsService };
