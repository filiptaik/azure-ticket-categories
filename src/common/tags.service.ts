import * as SDK from 'azure-devops-extension-sdk';
import {
  IWorkItemFormService,
  WorkItemTrackingServiceIds,
} from 'azure-devops-extension-api/WorkItemTracking/WorkItemTrackingServices';

import axios from 'axios';

async function hasResolvedByBeenSet(organization, project, workItemId) {
  const apiUrl = `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${workItemId}/updates?api-version=7.2-preview.3`;

  const auth = await SDK.getAccessToken();

  try {
    // Fetch the history updates of the work item
    const response = await axios.get(apiUrl, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    const updates = response.data.value;

    // Check each update for System.ResolvedBy changes
    return updates.some(
      update =>
        update.fields &&
        update.fields['System.ResolvedBy'] &&
        update.fields['System.ResolvedBy'].newValue
    );
  } catch (error) {
    console.error('Error checking work item updates:', error.message);
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
    console.log(organizationName);
    const accessToken = await SDK.getAccessToken();
    console.log(accessToken);
    console.log(workItemId);
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
    console.log('updated: ', typeof workItemUpdates);
    const apiUrl = `https://dev.azure.com/${organizationName}/_apis/wit/workitems/${workItemId}?api-version=7.1-preview.3`;

    // Fetch existing work item tags
    const workItemResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('response: ', workItemResponse);

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

export { addTagsToWorkItems, getAzureFieldValues, updateFieldValue, hasResolvedByBeenSet };
