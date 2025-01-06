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
  IWorkItemChangedArgs,
} from 'azure-devops-extension-api/WorkItemTracking/WorkItemTrackingServices';
import * as SDK from 'azure-devops-extension-sdk';
import { CascadingFieldsService } from '../common/cascading.service';
import { ManifestService } from '../common/manifest.service';
import {
  addTagsToWorkItems,
  getAzureFieldValues,
  hasResolvedByBeenSet,
  checkFieldHasValue,
  updateFieldValue,
} from '../common/tags.service';

let cachedFieldValues: { [key: string]: any } = {};

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
    let hasBeenResolvedAlready = false;
    const cascadingService = new CascadingFieldsService(workItemFormService, manifest.cascades);
    const provider: IWorkItemNotificationListener = {
      onLoaded: async (workItemLoadedArgs: IWorkItemLoadedArgs) => {
        try {
          if (!manifest || !manifest.cascades) {
            console.warn('Manifest is missing or does not contain cascades');
            return;
          }
          await cascadingService.getconfigFieldValues();
          hasBeenResolvedAlready = await hasResolvedByBeenSet(
            SDK.getHost().name,
            project.name,
            workItemLoadedArgs.id
          );

          const workItemFormService = await SDK.getService<IWorkItemFormService>(
            WorkItemTrackingServiceIds.WorkItemFormService
          );

          // Fetch and store the initial value of System.Reason
          originalReasonValue = await workItemFormService.getFieldValue('System.Reason', {
            returnOriginalValue: false,
          });
          const remainingWorkField = 'Microsoft.VSTS.Scheduling.RemainingWork';
          cachedFieldValues['remainingWork'] = await getAzureFieldValues(remainingWorkField, false);
        } catch (error) {
          console.error('Error applying cascading rules on load:', error);
        }
      },
      onSaved: async (savedEventArgs: IWorkItemChangedArgs) => {
        await cascadingService.cascadeAll();
        try {
          const workItemId = savedEventArgs.id;

          const workItemFormService = await SDK.getService<IWorkItemFormService>(
            WorkItemTrackingServiceIds.WorkItemFormService
          );
          const workItemType = await getAzureFieldValues('System.WorkItemType');
          const remainingWorkField = 'Microsoft.VSTS.Scheduling.RemainingWork';
          const newRemainingWork = await getAzureFieldValues(remainingWorkField);
          const oldRemainingWork = cachedFieldValues.remainingWork;
          if (
            workItemType === 'User Story' &&
            oldRemainingWork < newRemainingWork &&
            (await workItemFormService.isNew()) === false
          ) {
            addTagsToWorkItems(workItemId, 'Underestimated');
          }
          cachedFieldValues['remainingWork'] = await getAzureFieldValues(remainingWorkField, false);

          if (
            !hasBeenResolvedAlready &&
            (await hasResolvedByBeenSet(SDK.getHost().name, project.name, workItemId)) &&
            (await checkFieldHasValue(workItemId, 'Custom.ResponsibleDeveloper')) === false
          ) {
            updateFieldValue(workItemId, 'Custom.ResponsibleDeveloper', SDK.getUser().name);
            hasBeenResolvedAlready = false;
          }
        } catch (error) {
          console.error('Error in onSaved event:', error);
        }
      },
      onRefreshed: async () => await cascadingService.cascadeAll(),
      onReset: async () => await cascadingService.cascadeAll(),
      onUnloaded: async () => await cascadingService.resetAllCascades(),
      onFieldChanged: async (fieldChangedArgs: IWorkItemFieldChangedArgs) => {
        await cascadingService.performCascading(Object.keys(fieldChangedArgs.changedFields)[0]);

        console.log(SDK.getUser());
        const workItemFormService = await SDK.getService<IWorkItemFormService>(
          WorkItemTrackingServiceIds.WorkItemFormService
        );
        const workItemId = await workItemFormService.getId();
        const workItemType = await workItemFormService.getFieldValue('System.WorkItemType', {
          returnOriginalValue: false,
        });

        const reasonField = 'System.Reason';
        if (workItemType === 'Bug' && fieldChangedArgs.changedFields[reasonField]) {
          const newValue = await getAzureFieldValues(reasonField);

          if (originalReasonValue === 'Fixed' && newValue !== 'Fixed') {
            console.log(`System.Reason changed from 'Fixed' to '${newValue}'. Adding tag.`);
            addTagsToWorkItems(workItemId, 'Not As Designed');
          }
          originalReasonValue = newValue;
        }
      },
    };

    SDK.register<IWorkItemNotificationListener>(SDK.getContributionId(), provider);
    await SDK.notifyLoadSucceeded();
  }
);
