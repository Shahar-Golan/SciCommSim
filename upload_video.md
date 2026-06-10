videos path:
C:\Users\golan\VisualStudioProjects\SciCommSim\test\SciCom Tutorial - Group C.mp4
C:\Users\golan\VisualStudioProjects\SciCommSim\test\SciCom Tutorial 1.mp4

relevant code to help:

const express = require('express');
const { BlobServiceClient, BlobSASPermissions } = require('@azure/storage-blob');
const router = express.Router();

const AZURE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = "videos";

router.post('/api/upload-permission', async (req, res) => {
    try {
        const { fileName } = req.body; 
        // Example: 'simulator_demo_123.webm' (ensure you generate unique names)

        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);

        // Generate a SAS URL that expires in 5 minutes
        const sasUrl = await blockBlobClient.generateSasUrl({
            permissions: BlobSASPermissions.parse("cw"), // 'c'reate and 'w'rite
            expiresOn: new Date(new Date().valueOf() + 5 * 60 * 1000), 
        });

        // Send the secure upload URL back to the frontend
        res.json({ uploadUrl: sasUrl });

    } catch (error) {
        console.error("SAS Generation Error:", error);
        res.status(500).json({ error: "Failed to generate upload URL" });
    }
});


Instructions:
1. link the videos into the 'watch tutorial' button in C:\Users\golan\VisualStudioProjects\SciCommSim\client\src\pages\welcome.tsx

you should store them in Azure blob and set a refrence in the DB for fast implementation.

2. there are 2 videos.
you should choose which videos to show base on the feedback_routing_state counter
if counter % 3 == 2 -> present SciCom Tutorial - Group C.mp4
else: present SciCom Tutorial 1.mp4