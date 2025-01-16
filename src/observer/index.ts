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
  getWorkItemUpdates
} from '../common/tags.service';


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
    const organization = SDK.getHost().name
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
          if (!manifest || !manifest.cascades || workItemLoadedArgs.isNew) {
            console.warn('Manifest is missing, does not contain cascades or it is a new work item');
            return;
          }
          await cascadingService.getconfigFieldValues();
          hasBeenResolvedAlready = await hasResolvedByBeenSet(
            organization,
            project.name,
            workItemLoadedArgs.id
          );
          const workItemFormService = await SDK.getService<IWorkItemFormService>(
            WorkItemTrackingServiceIds.WorkItemFormService
          );

          // Fetch and store the initial value of Microsoft.VSTS.Common.ResolvedReason
          originalReasonValue = await workItemFormService.getFieldValue('Microsoft.VSTS.Common.ResolvedReason', {
            returnOriginalValue: false,
          });

        } catch (error) {
          console.error('Error applying cascading rules on load:', error);
        }
      },
      onSaved: async (savedEventArgs: IWorkItemChangedArgs) => {
        await cascadingService.cascadeAll();
        try {

          const workItemId = savedEventArgs.id;

          getWorkItemUpdates(organization, project.name, workItemId)

          const workItemFormService = await SDK.getService<IWorkItemFormService>(
            WorkItemTrackingServiceIds.WorkItemFormService
          );
          const workItemType = await getAzureFieldValues('System.WorkItemType');
          const onSavedReasonValue = await getAzureFieldValues('Microsoft.VSTS.Common.ResolvedReason');
          //prettier-ignore
          /*
          if (workItemType === 'Bug' && originalReasonValue === 'As Designed' && onSavedReasonValue !== 'As Designed') {
            console.log(
              `Microsoft.VSTS.Common.ResolvedReason changed from 'As Designed' to '${onSavedReasonValue}'. Adding tag. Original reason value: '${originalReasonValue}'`
            );
            addTagsToWorkItems(workItemId, 'Not As Designed');
          }
            */

          if (hasBeenResolvedAlready && (await hasResolvedByBeenSet(SDK.getHost().name, project.name, workItemId)) && (await checkFieldHasValue(workItemId, 'Custom.ResponsibleDeveloper')) === false) {
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
      },
    };

    SDK.register<IWorkItemNotificationListener>(SDK.getContributionId(), provider);
    await SDK.notifyLoadSucceeded();
  }
);
