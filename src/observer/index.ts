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
          // Optionally log details about the loaded work item
          /*
          console.log('Work item details:', workItemLoadedArgs);
          console.log('Cascading rules applied successfully after load');
          */
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
      },
    };

    SDK.register<IWorkItemNotificationListener>(SDK.getContributionId(), provider);
    await SDK.notifyLoadSucceeded();
  }
);
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
