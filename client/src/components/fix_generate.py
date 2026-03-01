import re

# Read the file
with open('DocumentProcessing.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the line with "onClick={async () => {" and replace the entire button onClick handler
# We'll be more surgical - find the section between the previewFooter and closing button tag

# Look for the pattern: <div className={styles.previewFooter}> ... </button>
# and replace only the onClick and its contents

pattern = r'(<button\s+className=\{styles\.generateButton\}\s+onClick=\{async \(\) => \{)[\s\S]*?(disabled=\{generateLoading\})'

replacement = r'''<button
                className={styles.generateButton}
                onClick={async () => {
                  if (!selectedFile || generateLoading) return;
                  setGenerateLoading(true);
                  try {
                    let request: any = null;
                    if (previewSelectedRequestId) {
                      const requestsForFile = getRequestsForFile(selectedFile._id);
                      request = requestsForFile.find((r: any) => (r._id || r.requestId) === previewSelectedRequestId) || null;
                    }
                    if (!request) request = getPrioritizedRequest(selectedFile._id) || getPrimaryRequest(selectedFile._id);

                    if (!request || !request.fieldValues) {
                      alert('No document request or field values found.');
                      setGenerateLoading(false);
                      return;
                    }

                    const result = await generateFilledDocx(selectedFile._id, request.fieldValues, (request._id || request.requestId));
                    const blob = result.blob;

                    const txId = request._id || request.requestId;
                    const filename = txId ? `${String(txId).replace(/[^a-zA-Z0-9-_.]/g, '_')}.docx` : `filled_${selectedFile.filename || 'document'}.docx`;
                    const url = window.URL.createObjectURL(new Blob([blob]));
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', filename);
                    document.body.appendChild(link);
                    link.click();
                    link.parentNode?.removeChild(link);
                    window.URL.revokeObjectURL(url);

                    const requestId = request._id || request.requestId;
                    try {
                      await documentsAPI.updateDocumentStatus(requestId, { status: 'approved' });
                      notification.open({
                        message: 'Success!',
                        description: 'Document generated and request marked as approved.',
                        duration: 3,
                      });
                    } catch (err) {
                      notification.open({
                        message: 'Document Generated',
                        description: 'Document downloaded. Status update failed.',
                        duration: 3,
                      });
                    }

                    await fetchFilesAndRequests();
                    setPreviewVisible(false);

                  } catch (err) {
                    console.error(err);
                    alert('Failed to generate document.');
                  } finally {
                    setGenerateLoading(false);
                  }
                }}
                \2'''

new_content = re.sub(pattern, replacement, content, flags=re.MULTILINE)

if new_content == content:
    print("No match found! Pattern might need adjustment.")
else:
    print("Match found and replaced!")

# Write back
with open('DocumentProcessing.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Done!")
