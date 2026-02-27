export interface IFeatureLeafMapping {
  featureId: string;
  category: string;
  area: string;
}

export interface IModuleMapping {
  defaults?: {
    category?: string;
    area?: string;
  };
  features: Record<string, IFeatureLeafMapping>;
}

export interface IFeatureCatalogueMapping {
  modules: Record<string, IModuleMapping>;
}

export interface IModuleDefaults {
  category?: string;
  area?: string;
}

export function getFeatureNamesForModule(
  mapping: IFeatureCatalogueMapping,
  moduleName: string
): string[] {
  const moduleMapping = mapping.modules[moduleName];
  if (!moduleMapping) {
    return [];
  }

  return Object.keys(moduleMapping.features).sort((a, b) => a.localeCompare(b));
}

export function getFeatureLeafMapping(
  mapping: IFeatureCatalogueMapping,
  moduleName: string,
  featureName: string
): IFeatureLeafMapping | null {
  const moduleMapping = mapping.modules[moduleName];
  if (!moduleMapping) {
    return null;
  }

  const featureMapping = moduleMapping.features[featureName];
  return featureMapping || null;
}

function getSingleValue(values: string[]): string | undefined {
  const uniqueValues = Array.from(new Set(values.filter(Boolean)));
  if (uniqueValues.length === 1) {
    return uniqueValues[0];
  }

  return undefined;
}

export function getModuleDefaults(
  mapping: IFeatureCatalogueMapping,
  moduleName: string
): IModuleDefaults {
  const moduleMapping = mapping.modules[moduleName];
  if (!moduleMapping) {
    return {};
  }

  if (moduleMapping.defaults) {
    return moduleMapping.defaults;
  }

  const leaves = Object.values(moduleMapping.features);
  return {
    category: getSingleValue(leaves.map(leaf => leaf.category)),
    area: getSingleValue(leaves.map(leaf => leaf.area)),
  };
}
