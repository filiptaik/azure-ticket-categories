import * as SDK from 'azure-devops-extension-sdk';
import {
  IWorkItemFormService,
  WorkItemTrackingServiceIds,
} from 'azure-devops-extension-api/WorkItemTracking/WorkItemTrackingServices';

import axios from 'axios';

async function apiService(apiUrl) {
  const auth = await SDK.getAccessToken();

  const response = await axios.get(apiUrl, {
    headers: {
      Authorization: `Bearer ${auth}`,
      'Content-Type': 'application/json',
    },
  });

  return response
}

async function getWorkItemUpdates(organization, project, workItemId) {
  const apiUrl = `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${workItemId}/updates?api-version=7.1`;

  const remainingWorkField = "Microsoft.VSTS.Scheduling.RemainingWork"
  const closedByField = "Microsoft.VSTS.Common.ClosedBy"
  const resolvedReasonField = "Microsoft.VSTS.Common.ResolvedReason"
  const systemReasonField = "System.Reason"
  const stateField = "System.State"
  const responsibleDevField = "Custom.ResponsibleDeveloper"

  const auth = await SDK.getAccessToken();
  try {
    // Fetch the full revisions of the work item
    const response = await axios.get(apiUrl, {
      headers: {
        Authorization: `Bearer ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    const fieldsChangedOnSave = response.data.value[response.data.value.length - 1].fields
    console.log("Changed fields", fieldsChangedOnSave)


    if (fieldsChangedOnSave.hasOwnProperty(closedByField)) {
      if (fieldsChangedOnSave[closedByField].hasOwnProperty("newValue") && isUserInQA(fieldsChangedOnSave[closedByField].newValue.displayName)) {
        console.log("Ticket closed by", fieldsChangedOnSave[closedByField].newValue.displayName)
        updateFieldValue(workItemId, "Custom.TestedBy", fieldsChangedOnSave[closedByField].newValue.displayName)
      }
    }

    if (fieldsChangedOnSave.hasOwnProperty(remainingWorkField)) {
      console.log("NEW VALUE: ", fieldsChangedOnSave[remainingWorkField].newValue, " OLD VALUE: ", fieldsChangedOnSave[remainingWorkField].oldValue)
      if (fieldsChangedOnSave[remainingWorkField].newValue > fieldsChangedOnSave[remainingWorkField].oldValue) {
        addTagsToWorkItems(workItemId, 'Underestimated');
      }
    }

    if (fieldsChangedOnSave.hasOwnProperty(resolvedReasonField) || fieldsChangedOnSave.hasOwnProperty(systemReasonField)) {
      const resolvedField = fieldsChangedOnSave[resolvedReasonField];
      const systemField = fieldsChangedOnSave[systemReasonField];

      if (
        resolvedField?.hasOwnProperty("oldValue") &&
        (
          (resolvedField.oldValue === 'As Designed' && resolvedField.newValue !== 'As Designed') ||
          (systemField?.oldValue === 'As Designed' && systemField?.newValue !== 'As Designed')
        )
      ) {
        addTagsToWorkItems(workItemId, 'Not As Designed');
      }
    }

    /* 
    --------------------------------------------------------------------------------------

     new logic to set the resolved by field. checks on any save where state changed to Resolved whether this is the first time it has been done. If yes, set the user that resolved, if no, set the OG resolver */
    if (fieldsChangedOnSave.hasOwnProperty(stateField)) {
      if (fieldsChangedOnSave[stateField].newValue === "Re-opened") {
        incrementIntegerField(workItemId, "Custom.TimesinReopened")
      }

      if (fieldsChangedOnSave[stateField].newValue === "Resolved" && !(await checkFieldHasValue(workItemId, responsibleDevField))) {
        let isFirstTimeResolved = await hasResolvedByBeenSet(organization, project, workItemId)
        if (isFirstTimeResolved !== false) {
          console.log("prev resolver", isFirstTimeResolved.displayName)
          updateFieldValue(workItemId, responsibleDevField, isFirstTimeResolved.displayName)
          // set the field value to user that originally set to resolved
        } else {
          // set field value to user that set to resolved 
          console.log("never been resolved")
          updateFieldValue(workItemId, responsibleDevField, SDK.getUser().displayName)
        }
      }
    }
    // -------------------------------------------------------------------------------------
  } catch (error) {
    console.error('Error fetching work item revisions:', error.message);
    throw error;
  }
}


async function incrementIntegerField(workItemId: number, fieldId: string) {
  try {
    // Initialize the Azure DevOps SDK
    SDK.init();

    // Get the host context and access token
    const hostContext = SDK.getHost();
    if (!hostContext || !hostContext.name) {
      throw new Error('Failed to retrieve host context or organization name.');
    }

    const organizationName = hostContext.name;
    const accessToken = await SDK.getAccessToken();

    const apiUrl = `https://dev.azure.com/${organizationName}/_apis/wit/workitems/${workItemId}?api-version=7.1-preview.3`;

    // Fetch the current work item data
    const workItemResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!workItemResponse.ok) {
      throw new Error(`Failed to fetch work item: ${workItemResponse.statusText}`);
    }

    const workItem = await workItemResponse.json();
    const currentValue = workItem.fields[fieldId] || 0; // Default to 0 if the field is empty

    // Increment the value
    const newValue = currentValue + 1;

    // Update the field with the incremented value
    const updateResponse = await fetch(apiUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json-patch+json',
      },
      body: JSON.stringify([
        {
          op: 'add',
          path: `/fields/${fieldId}`,
          value: newValue,
        },
      ]),
    });

    if (!updateResponse.ok) {
      throw new Error(`Failed to update work item: ${updateResponse.statusText}`);
    }

    console.log(`Field ${fieldId} incremented to ${newValue}`);
    return true;
  } catch (error) {
    console.error('Error incrementing field:', error);
    return false;
  }
}


async function isUserInQA(userName) {
  const qaTeamId = "7dd8d65b-03bb-48ed-86a4-34dc27c9971a";
  const apiUrl = `https://dev.azure.com/shepherdcmms/_apis/projects/Shepherd%20CMMS/teams/${qaTeamId}/members?api-version=7.1`;

  try {
    const response = await apiService(apiUrl);
    const qaMembers = response.data.value;

    return qaMembers.some(member => userName === member.identity.displayName);
  } catch (error) {
    console.error("Error fetching QA members:", error);
    return false;
  }
}

async function hasResolvedByBeenSet(organization, project, workItemId) {
  const apiUrl = `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${workItemId}/revisions?api-version=7.1`;

  const auth = await SDK.getAccessToken();

  try {
    // Fetch the full revisions of the work item
    const response = await axios.get(apiUrl, {
      headers: {
        Authorization: `Bearer ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    const revisions = response.data.value;

    // Iterate through the revisions to check for ResolvedBy
    for (const revision of revisions) {
      const state = revision.fields['System.State'];
      const resolvedBy = revision.fields['Microsoft.VSTS.Common.ResolvedBy'];

      // Check if state is 'Resolved' and ResolvedBy is set
      if (state === 'Resolved' && resolvedBy) {
        return resolvedBy; // Found a resolved state with ResolvedBy set
      }
    }

    // If no revision satisfies the condition
    return false;
  } catch (error) {
    console.error('Error fetching work item revisions:', error.message);
    throw error;
  }
}




async function checkFieldHasValue(workItemId: number, fieldId: string) {
  try {
    // Initialize the Azure DevOps SDK
    SDK.init();

    // Get the host context and access token
    const hostContext = SDK.getHost();
    if (!hostContext || !hostContext.name) {
      throw new Error('Failed to retrieve host context or organization name.');
    }

    const organizationName = hostContext.name;
    const accessToken = await SDK.getAccessToken();

    const apiUrl = `https://dev.azure.com/${organizationName}/_apis/wit/workitems/${workItemId}?api-version=7.1-preview.3`;

    // Fetch the current work item data
    const workItemResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!workItemResponse.ok) {
      throw new Error(`Failed to fetch work item: ${workItemResponse.statusText}`);
    }

    const workItem = await workItemResponse.json();
    const fieldValue = workItem.fields[fieldId];

    return fieldValue !== undefined && fieldValue !== null;
  } catch (error) {
    console.error('Error checking field value:', error);
    return false;
  }
}

async function addTagsToWorkItems(workItemId: number, tagToAdd: string): Promise<void> {
  try {
    // Initialize the Azure DevOps SDK
    SDK.init();

    // Get the host context to retrieve the organization name
    const hostContext = SDK.getHost();

    if (!hostContext || !hostContext.name) {
      throw new Error('Failed to retrieve host context or organization name.');
    }

    const organizationName = hostContext.name;
    const accessToken = await SDK.getAccessToken();
    const workItemUpdates = await fetch(
      `https://dev.azure.com/${organizationName}/_apis/wit/workItems/${workItemId}/updates?api-version=7.1`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const apiUrl = `https://dev.azure.com/${organizationName}/_apis/wit/workitems/${workItemId}?api-version=7.1-preview.3`;

    // Fetch existing work item tags
    const workItemResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!workItemResponse.ok) {
      throw new Error(`Failed to fetch work item: ${workItemResponse.statusText}`);
    }

    const workItem = await workItemResponse.json();
    const existingTags = workItem.fields['System.Tags']
      ? workItem.fields['System.Tags'].split('; ')
      : [];

    // Check if the tag already exists
    if (existingTags.includes(tagToAdd)) {
      console.log(`Tag "${tagToAdd}" already exists on work item ID ${workItemId}.`);
      return;
    }

    // Prepare the PATCH payload
    const newTags = [...existingTags, tagToAdd].join('; ');
    const patchDocument = [
      {
        op: 'add',
        path: '/fields/System.Tags',
        value: newTags,
      },
    ];

    // Send the PATCH request to update the work item
    const updateResponse = await fetch(apiUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json-patch+json',
      },
      body: JSON.stringify(patchDocument),
    });

    if (!updateResponse.ok) {
      throw new Error(`Failed to update work item: ${updateResponse.statusText}`);
    }

    console.log(`Tag "${tagToAdd}" successfully added to work item ID ${workItemId}.`);
  } catch (error) {
    console.error('Error adding tag to work item:', error);
  }
}

async function getAzureFieldValues(field: string, changedValue = true) {
  const workItemFormService = await SDK.getService<IWorkItemFormService>(
    WorkItemTrackingServiceIds.WorkItemFormService
  );
  if (changedValue === true) {
    return await workItemFormService.getFieldValue(field, {
      returnOriginalValue: false,
    });
  } else {
    return await workItemFormService.getFieldValue(field, {
      returnOriginalValue: true,
    });
  }
}

async function updateFieldValue(workItemId: number, fieldId: string, newValue) {
  try {
    // Initialize the Azure DevOps SDK
    SDK.init();

    // Get the host context and access token
    const hostContext = SDK.getHost();
    if (!hostContext || !hostContext.name) {
      throw new Error('Failed to retrieve host context or organization name.');
    }

    const organizationName = hostContext.name;
    const accessToken = await SDK.getAccessToken();

    const apiUrl = `https://dev.azure.com/${organizationName}/_apis/wit/workitems/${workItemId}?api-version=7.1-preview.3`;

    // Fetch the current work item data
    const workItemResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!workItemResponse.ok) {
      throw new Error(`Failed to fetch work item: ${workItemResponse.statusText}`);
    }

    const workItem = await workItemResponse.json();
    const fieldValue = workItem.fields[fieldId];

    // Validate new value based on the field type (if necessary)
    if (fieldValue !== undefined && typeof fieldValue !== typeof newValue) {
      throw new Error(
        `Invalid value type for field '${fieldId}'. Expected type: ${typeof fieldValue}, got: ${typeof newValue}`
      );
    }

    // Prepare the PATCH payload
    const patchDocument = [
      {
        op: fieldValue !== undefined ? 'replace' : 'add',
        path: `/fields/${fieldId}`,
        value: newValue,
      },
    ];

    // Send the PATCH request to update the work item
    const updateResponse = await fetch(apiUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json-patch+json',
      },
      body: JSON.stringify(patchDocument),
    });

    if (!updateResponse.ok) {
      throw new Error(`Failed to update work item: ${updateResponse.statusText}`);
    }

    console.log(`Field '${fieldId}' successfully updated on work item ID ${workItemId}.`);
  } catch (error) {
    console.error('Error updating field value:', error);
  }
}

export {
  addTagsToWorkItems,
  getAzureFieldValues,
  updateFieldValue,
  hasResolvedByBeenSet,
  checkFieldHasValue,
  getWorkItemUpdates
};
