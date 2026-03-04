import type { IFeatureCatalogueMapping } from './feature-catalogue';

export interface IManifest {
  version?: string;
  // Legacy key kept for backward compatibility; ignored by runtime logic.
  cascades?: unknown;
  featureCatalogue?: IFeatureCatalogueConfiguration;
}

export interface IFeatureCatalogueFieldRefs {
  module?: string;
  featureName?: string;
  featureId?: string;
  category?: string;
  areaPath?: string;
}

export interface IFeatureCatalogueConfiguration {
  fields?: IFeatureCatalogueFieldRefs;
  mapping?: IFeatureCatalogueMapping;
}
