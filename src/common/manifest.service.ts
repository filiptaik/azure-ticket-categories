import { ConfigurationStorage, ConfigurationType } from './storage.service';
import { IManifest } from './types';

type Validator = (manifest: IManifest) => Promise<null | IManifestValidationError>;

const ManifestMetadata = {
  availableVersions: [1],
};

enum ValidationErrorCode {
  SyntaxError,
  MissingRequiredProperty,
  InvalidVersion,
  InvalidCascadeType,
}

interface IManifestValidationError {
  code: ValidationErrorCode;
  description: string;
}

class ManifestService {
  private configurationStorage: ConfigurationStorage;

  public static defaultManifest: IManifest = Object.freeze({
    version: '1',
  });

  public constructor(projectId: string) {
    this.configurationStorage = new ConfigurationStorage(ConfigurationType.Manifest, projectId);
  }

  public async getManifest(): Promise<IManifest> {
    return this.configurationStorage.getConfiguration();
  }

  public async updateManifest(manifest: IManifest): Promise<IManifest> {
    return this.configurationStorage.setConfiguration(manifest);
  }
}

class ManifestValidationService {
  private validators: Validator[] = [
    this.checkVersion,
    this.checkFeatureCatalogueType,
  ];
  private requiredProperties = ['version'];

  public async validate(manifest: Object): Promise<null | IManifestValidationError[]> {
    const errors: IManifestValidationError[] = [];

    const error = await this.checkRequiredProperties(manifest, this.requiredProperties);
    if (error) {
      return [error];
    }

    for (let validator of this.validators) {
      const error = await validator.call(this, manifest);
      error ? errors.push(error) : null;
    }

    if (errors.length > 0) {
      return errors;
    }

    return null;
  }

  private async checkRequiredProperties(
    manifest: IManifest,
    requiredProperties: string[]
  ): Promise<null | IManifestValidationError> {
    const missingProperties: string[] = [];
    for (let property of requiredProperties) {
      if (!manifest.hasOwnProperty(property)) {
        missingProperties.push(property);
      }
    }
    if (missingProperties.length > 0) {
      return {
        code: ValidationErrorCode.MissingRequiredProperty,
        description: `Properties missing: ${missingProperties.join(', ')}`,
      };
    }
    return null;
  }

  private async checkVersion(manifest: IManifest): Promise<null | IManifestValidationError> {
    if (!ManifestMetadata.availableVersions.includes(Number(manifest.version))) {
      return {
        code: ValidationErrorCode.InvalidVersion,
        description: `Unknown version: ${manifest.version}`,
      };
    }
    return null;
  }

  private async checkFeatureCatalogueType(
    manifest: IManifest
  ): Promise<null | IManifestValidationError> {
    if (typeof manifest.featureCatalogue === 'undefined') {
      return null;
    }

    if (typeof manifest.featureCatalogue !== 'object' || Array.isArray(manifest.featureCatalogue)) {
      return {
        code: ValidationErrorCode.InvalidCascadeType,
        description: '"featureCatalogue" should be an object',
      };
    }

    const fields = manifest.featureCatalogue.fields;
    if (typeof fields !== 'undefined' && (typeof fields !== 'object' || Array.isArray(fields))) {
      return {
        code: ValidationErrorCode.InvalidCascadeType,
        description: '"featureCatalogue.fields" should be an object',
      };
    }

    const mapping = manifest.featureCatalogue.mapping;
    if (typeof mapping !== 'undefined') {
      if (typeof mapping !== 'object' || Array.isArray(mapping)) {
        return {
          code: ValidationErrorCode.InvalidCascadeType,
          description: '"featureCatalogue.mapping" should be an object',
        };
      }
      if (typeof (mapping as any).modules !== 'object' || Array.isArray((mapping as any).modules)) {
        return {
          code: ValidationErrorCode.InvalidCascadeType,
          description: '"featureCatalogue.mapping.modules" should be an object',
        };
      }
    }

    return null;
  }
}

export {
  ManifestService,
  ManifestValidationService,
  IManifestValidationError,
  ValidationErrorCode,
};
