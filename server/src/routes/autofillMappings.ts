const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Save autofill mappings for a template
router.post('/templates/:id/autofill-mappings', (req, res) => {
  const { id } = req.params;
  const { mappings } = req.body;
  
  console.log(`[AutofillMappings] POST request for template ID: ${id}`);
  console.log(`[AutofillMappings] Mappings received:`, mappings);
  
  if (!mappings || typeof mappings !== 'object') {
    console.log('[AutofillMappings] Error: Invalid mappings object');
    return res.status(400).json({ error: 'Mappings object is required' });
  }
  
  // Store mappings in a JSON file
  const mappingsDir = path.join(__dirname, '../../data/autofill-mappings');
  const mappingFile = path.join(mappingsDir, `${id}.json`);
  
  console.log(`[AutofillMappings] Saving mappings to: ${mappingFile}`);
  
  // Ensure directory exists
  fs.mkdir(mappingsDir, { recursive: true }, (err) => {
    if (err) {
      console.error('[AutofillMappings] Failed to create mappings directory:', err);
      return res.status(500).json({ error: 'Failed to save mappings' });
    }
    
    // Save mappings to file
    fs.writeFile(mappingFile, JSON.stringify(mappings, null, 2), 'utf8', (writeErr) => {
      if (writeErr) {
        console.error('[AutofillMappings] Failed to write mappings file:', writeErr);
        return res.status(500).json({ error: 'Failed to save mappings' });
      }
      
      console.log(`[AutofillMappings] Successfully saved mappings for template: ${id}`);
      res.json({ success: true, message: 'Autofill mappings saved successfully' });
    });
  });
});

// Get autofill mappings for a template
router.get('/templates/:id/autofill-mappings', (req, res) => {
  const { id } = req.params;
  const mappingFile = path.join(__dirname, '../../data/autofill-mappings', `${id}.json`);
  
  console.log(`[AutofillMappings] GET request for template ID: ${id}`);
  
  fs.readFile(mappingFile, 'utf8', (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        console.log(`[AutofillMappings] No mappings found for template: ${id}`);
        // No mappings found, return empty object
        return res.json({ mappings: {} });
      }
      console.error('[AutofillMappings] Failed to read mappings file:', err);
      return res.status(500).json({ error: 'Failed to load mappings' });
    }
    
    try {
      const mappings = JSON.parse(data);
      console.log(`[AutofillMappings] Successfully loaded mappings for template: ${id}`);
      res.json({ mappings });
    } catch (parseErr) {
      console.error('[AutofillMappings] Failed to parse mappings:', parseErr);
      res.status(500).json({ error: 'Invalid mappings data' });
    }
  });
});

module.exports = router;
