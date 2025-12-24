/**
 * Extract file extension from filename
 * @param filename - The original filename
 * @returns The file extension without the dot (e.g., 'png', 'jpg', 'zip')
 */
export const getFileExtension = (filename: string): string => {
  if (!filename) return 'unknown';
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'unknown';
};

/**
 * Get human-readable file type label from extension
 * @param extension - The file extension
 * @returns A formatted label for display
 */
export const getFileTypeLabel = (extension: string): string => {
  const extension_lower = extension.toLowerCase();
  
  const fileTypeMap: Record<string, string> = {
    // Images
    'jpg': 'JPG Image',
    'jpeg': 'JPEG Image',
    'png': 'PNG Image',
    'gif': 'GIF Image',
    'bmp': 'BMP Image',
    'webp': 'WebP Image',
    'svg': 'SVG Image',
    
    // Documents
    'pdf': 'PDF Document',
    'doc': 'Word Document',
    'docx': 'Word Document',
    'xls': 'Excel Spreadsheet',
    'xlsx': 'Excel Spreadsheet',
    'ppt': 'PowerPoint',
    'pptx': 'PowerPoint',
    'txt': 'Text File',
    'rtf': 'Rich Text File',
    'odt': 'OpenDocument',
    
    // Archives
    'zip': 'ZIP Archive',
    'rar': 'RAR Archive',
    '7z': '7Z Archive',
    'tar': 'TAR Archive',
    'gz': 'GZIP Archive',
    
    // Code
    'json': 'JSON File',
    'xml': 'XML File',
    'html': 'HTML File',
    'css': 'CSS File',
    'js': 'JavaScript File',
    'ts': 'TypeScript File',
    'py': 'Python File',
  };
  
  return fileTypeMap[extension_lower] || `${extension_lower.toUpperCase()} File`;
};

/**
 * Determine if a file type is viewable in browser
 */
export const isViewableFileType = (extension: string): boolean => {
  const viewableTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'pdf', 'svg'];
  return viewableTypes.includes(extension.toLowerCase());
};

/**
 * Get MIME type from file extension
 */
export const getMimeType = (extension: string): string => {
  const mimeTypeMap: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'pdf': 'application/pdf',
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'txt': 'text/plain',
    'json': 'application/json',
    'xml': 'application/xml',
    'html': 'text/html',
    'css': 'text/css',
  };
  
  return mimeTypeMap[extension.toLowerCase()] || 'application/octet-stream';
};
