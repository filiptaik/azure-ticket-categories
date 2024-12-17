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

    /*
    console.log('money fest ' + JSON.stringify(manifest));
    console.log('flipped money fest ' + JSON.stringify(flipManifestStructure(manifest)));
    */

    if (manifest == null) {
      manifest = Object.assign({}, ManifestService.defaultManifest);
    }
    let originalReasonValue;
    const cascadingService = new CascadingFieldsService(workItemFormService, manifest.cascades);
    const provider: IWorkItemNotificationListener = {
      onLoaded: async (workItemLoadedArgs: IWorkItemLoadedArgs) => {
        //console.log('Work item data' + workItemFormService.getFieldValues);
        try {
          // Ensure the manifest is available
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

        // ---------- NEW LOGIC -----------
        console.log('Changed Fields:', fieldChangedArgs);
        console.log('b4');
        const workItemFormService = await SDK.getService<IWorkItemFormService>(
          WorkItemTrackingServiceIds.WorkItemFormService
        );
        console.log('after');
        const workItemType = await workItemFormService.getFieldValue('System.WorkItemType', {
          returnOriginalValue: false,
        });
        console.log(workItemType);
        const reasonField = 'System.Reason';

        // Check if System.WorkItemType is 'Bug' and System.Reason changed
        if (workItemType === 'Bug' && fieldChangedArgs.changedFields[reasonField]) {
          const newValue = await workItemFormService.getFieldValue(reasonField, {
            returnOriginalValue: false,
          });

          console.log(`Original Reason: ${originalReasonValue}, New Reason: ${newValue}`);

          if (originalReasonValue === 'Fixed' && newValue !== 'Fixed') {
            console.log(
              `System.Reason changed from 'Fixed' to '${newValue}'. Calling changedFromFixed.`
            );
            changedFromFixed();
          }
          originalReasonValue = newValue;
        }
      },
    };

    SDK.register<IWorkItemNotificationListener>(SDK.getContributionId(), provider);
    await SDK.notifyLoadSucceeded();
  }
);

function changedFromFixed() {
  return console.log('triggered');
}

/*
function flipManifestStructure(manifest: Record<string, any>): Record<string, any> {
  const flippedCascades: Record<string, any> = {};

  // Access the cascades section of the manifest
  const cascades = manifest.cascades;

  // Process each field in cascades
  Object.entries(cascades).forEach(([outerField, outerValues]) => {
    Object.entries(outerValues).forEach(([outerKey, innerValues]) => {
      Object.entries(innerValues).forEach(([innerField, innerArray]) => {
        // Ensure `innerArray` is treated as an array
        if (Array.isArray(innerArray)) {
          innerArray.forEach((innerKey: string) => {
            // Build the flipped structure
            if (!flippedCascades[innerField]) {
              flippedCascades[innerField] = {};
            }
            if (!flippedCascades[innerField][innerKey]) {
              flippedCascades[innerField][innerKey] = {};
            }
            if (!flippedCascades[innerField][innerKey][outerField]) {
              flippedCascades[innerField][innerKey][outerField] = [];
            }
            flippedCascades[innerField][innerKey][outerField].push(outerKey);
          });
        } else {
          console.error(`Expected an array but got ${typeof innerArray}`, innerArray);
        }
      });
    });
  });

  // Return the flipped manifest
  return {
    ...manifest,
    cascades: flippedCascades,
  };
}
*/
