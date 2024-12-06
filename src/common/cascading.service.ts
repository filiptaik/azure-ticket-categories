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

type InvalidField = string;

class CascadingFieldsService {
  private workItemService: IWorkItemFormService;
  private cascadeMap: CascadeMap;

  public constructor(
    workItemService: IWorkItemFormService,
    cascadeConfiguration: CascadeConfiguration
  ) {
    this.workItemService = workItemService;
    this.cascadeMap = this.createCascadingMap(cascadeConfiguration);
    console.log(JSON.stringify('cascade config OG ' + JSON.stringify(cascadeConfiguration)));
    this.fetchAndLogInitialValues();
  }
  private async fetchAndLogInitialValues(): Promise<void> {
    const testCustomerField = 'Custom.TestCustomer'; // Adjust the field reference name if needed

    const testCustomerValue = await this.workItemService.getFieldValue(testCustomerField, {
      returnOriginalValue: false,
    });

    if (testCustomerValue !== undefined && testCustomerValue !== null) {
      console.log(`Initial value of ${testCustomerField}: ${testCustomerValue}`);
      // Trigger cascading logic based on the initial value of Custom.TestCustomer
      await this.updateImplementationTeam(testCustomerValue as string);
    } else {
      console.log(`Initial value of ${testCustomerField} is undefined or null.`);
    }
  }

  private async updateImplementationTeam(customerValue: string): Promise<void> {
    const implementationTeamField = 'Custom.TestImplementationTeam';
    const cascade = this.cascadeMap[implementationTeamField];

    if (!cascade) {
      console.log(`No cascade configuration for ${implementationTeamField}`);
      return;
    }

    const matchingTeams = Object.entries(cascade.cascades).filter(([team, dependencies]) => {
      const customers = dependencies['Custom.TestCustomer'] as string[];
      return customers && customers.includes(customerValue);
    });

    if (matchingTeams.length > 0) {
      const selectedTeam = matchingTeams[0][0]; // Auto-select the first matching team
      console.log(`Setting ${implementationTeamField} to: ${selectedTeam}`);
      await this.workItemService.setFieldValue(implementationTeamField, selectedTeam);
    } else {
      console.log(`No matching team found for ${customerValue}`);
    }
  }

  private createCascadingMap(cascadeConfiguration: CascadeConfiguration): CascadeMap {
    const cascadeMap: CascadeMap = {};
    if (typeof cascadeConfiguration === 'undefined') {
      return cascadeMap;
    }
    console.log('FIRST CASCADE MAP: ' + JSON.stringify(cascadeMap));

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
    return Promise.all(
      Array.from(fieldsToReset).map(async fieldName => {
        const values = await this.workItemService.getAllowedFieldValues(fieldName);
        await (this.workItemService as any).filterAllowedFieldValues(fieldName, values);
      })
    );
  }

  public async cascadeAll(): Promise<void[][]> {
    return Promise.all(
      Object.keys(this.cascadeMap).map(async field => this.performCascading(field))
    );
  }
  public async performCascading(changedFieldReferenceName: string): Promise<void[]> {
    const changedFieldValue = (await this.workItemService.getFieldValue(changedFieldReferenceName, {
      returnOriginalValue: false,
    })) as string;
    //console.log('CHANGED STRING VALUE: ' + changedFieldValue);
    // Ensure the changed field is the dependent field
    if (
      !Object.values(this.cascadeMap).some(cascade => {
        return Object.keys(cascade.cascades).some(parentValue => {
          return cascade.cascades[parentValue]?.hasOwnProperty(changedFieldReferenceName);
        });
      })
    ) {
      //console.log(`No cascading configuration for field: ${changedFieldReferenceName}`);
      return;
    }

    // Find the parent field(s) affected by this dependent field
    const affectedParentFields = Object.keys(this.cascadeMap).filter(parentField => {
      return Object.values(this.cascadeMap[parentField].cascades).some(dependencies => {
        const allowedValues = dependencies[changedFieldReferenceName] as string[];
        return allowedValues?.includes(changedFieldValue);
      });
    });

    //console.log('Affected parent fields:', affectedParentFields);

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

    //console.log('Field values to filter:', fieldValuesToFilter);

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
    const testCustomer = await this.workItemService.getFieldValue('Custom.TestCustomer', {
      returnOriginalValue: false,
    });
    const testImplementationTeam = await this.workItemService.getFieldValue(
      'Custom.TestImplementationTeam',
      {
        returnOriginalValue: false,
      }
    );
    if (typeof testCustomer === 'string' && typeof testImplementationTeam === 'undefined') {
      this.performCascading(JSON.stringify(testCustomer));
      console.log('aeg muutusteks 5');
    } else {
      console.log('kõik timmis');
      return;
    }
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
