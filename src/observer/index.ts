import {
  CommonServiceIds,
  IProjectPageService,
} from 'azure-devops-extension-api/Common/CommonServices';
import {
  IWorkItemFieldChangedArgs,
  IWorkItemFormService,
  IWorkItemNotificationListener,
  WorkItemTrackingServiceIds,
  IWorkItemLoadedArgs,
} from 'azure-devops-extension-api/WorkItemTracking/WorkItemTrackingServices';
import * as SDK from 'azure-devops-extension-sdk';
import { CascadingFieldsService } from '../common/cascading.service';
import { ManifestService } from '../common/manifest.service';
import { addTagsToWorkItems, getAzureFieldValues } from '../common/tags.service';

SDK.init({
  applyTheme: true,
  loaded: false,
}).then(
  async (): Promise<void> => {
    const workItemFormService = await SDK.getService<IWorkItemFormService>(
      WorkItemTrackingServiceIds.WorkItemFormService
    );

    const projectInfoService = await SDK.getService<IProjectPageService>(
      CommonServiceIds.ProjectPageService
    );
    const project = await projectInfoService.getProject();
    const manifestService = new ManifestService(project.id);
    let manifest = await manifestService.getManifest();

    if (manifest == null) {
      manifest = Object.assign({}, ManifestService.defaultManifest);
    }
    let originalReasonValue;
    const cascadingService = new CascadingFieldsService(workItemFormService, manifest.cascades);
    const provider: IWorkItemNotificationListener = {
      onLoaded: async (workItemLoadedArgs: IWorkItemLoadedArgs) => {
        //console.log('Work item data' + workItemFormService.getFieldValues);
        try {
          if (!manifest || !manifest.cascades) {
            console.warn('Manifest is missing or does not contain cascades');
            return;
          }
          await cascadingService.getconfigFieldValues();

          const workItemFormService = await SDK.getService<IWorkItemFormService>(
            WorkItemTrackingServiceIds.WorkItemFormService
          );

          // Fetch and store the initial value of System.Reason
          originalReasonValue = await workItemFormService.getFieldValue('System.Reason', {
            returnOriginalValue: false,
          });

          console.log(`Original System.Reason value loaded: ${originalReasonValue}`);
        } catch (error) {
          console.error('Error applying cascading rules on load:', error);
        }
      },
      onSaved: async () => await cascadingService.cascadeAll(),
      onRefreshed: async () => await cascadingService.cascadeAll(),
      onReset: async () => await cascadingService.cascadeAll(),
      onUnloaded: async () => await cascadingService.resetAllCascades(),
      onFieldChanged: async (fieldChangedArgs: IWorkItemFieldChangedArgs) => {
        await cascadingService.performCascading(Object.keys(fieldChangedArgs.changedFields)[0]);

        //console.log('b4');

        const workItemFormService = await SDK.getService<IWorkItemFormService>(
          WorkItemTrackingServiceIds.WorkItemFormService
        );
        const workItemId = await workItemFormService.getId();
        // console.log('after');
        const workItemType = await workItemFormService.getFieldValue('System.WorkItemType', {
          returnOriginalValue: false,
        });
        // console.log(workItemType);
        const reasonField = 'System.Reason';
        const remainingWorkField = 'Microsoft.VSTS.Scheduling.RemainingWork';

        // --------------------------

        if (workItemType === 'Bug' && fieldChangedArgs.changedFields[reasonField]) {
          const newValue = await getAzureFieldValues(reasonField);

          if (originalReasonValue === 'Fixed' && newValue !== 'Fixed') {
            console.log(`System.Reason changed from 'Fixed' to '${newValue}'. Adding tag.`);
            addTagsToWorkItems(workItemId, 'Not As Designed');
          }
          originalReasonValue = newValue;
        }
        // --------------------------

        if (workItemType === 'User Story' && fieldChangedArgs.changedFields[remainingWorkField]) {
          //console.log('\n', 'remaining work changed', '\n');
          const newValue = await getAzureFieldValues(remainingWorkField);
          const oldValue = await getAzureFieldValues(remainingWorkField, false);
          console.log('OLD: ', oldValue, '\n', 'NEW: ', newValue);
          if (oldValue < newValue) {
            addTagsToWorkItems(workItemId, 'Underestimated');
          }
        }
      },
    };

    SDK.register<IWorkItemNotificationListener>(SDK.getContributionId(), provider);
    await SDK.notifyLoadSucceeded();
  }
);
