import * as SDK from 'azure-devops-extension-sdk';

export async function addTagsToWorkItems(workItemId: number): Promise<void> {
  try {
    // Initialize the Azure DevOps SDK
    SDK.init();

    // Get the host context to retrieve the organization name
    const hostContext = SDK.getHost();

    if (!hostContext || !hostContext.name) {
      throw new Error('Failed to retrieve host context or organization name.');
    }

    const organizationName = hostContext.name;

    // Define the tag to be added
    const tagToAdd = 'Not As Designed'; // Replace with your desired tag

    // Define the API URL for updating the work item
    const apiUrl = `https://dev.azure.com/${organizationName}/_apis/wit/workitems/${workItemId}?api-version=7.1-preview.3`;

    // Fetch an access token for authentication
    const accessToken = await SDK.getAccessToken();

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
