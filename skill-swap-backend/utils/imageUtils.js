/**
 * Image utility functions for handling base64 images
 */

/**
 * Validate base64 image format and size
 * @param {string} base64Image - Base64 encoded image
 * @param {number} maxSizeMB - Maximum size in MB (default: 5MB)
 * @returns {object} - { isValid: boolean, error?: string, mimeType?: string }
 */
const validateBase64Image = (base64Image, maxSizeMB = 5) => {
  try {
    if (!base64Image || typeof base64Image !== 'string') {
      return { isValid: false, error: 'Image data is required and must be a string' };
    }

    // Check if it's a valid data URL
    const dataUrlRegex = /^data:image\/(jpeg|jpg|png|gif|webp);base64,(.+)$/;
    const match = base64Image.match(dataUrlRegex);
    
    if (!match) {
      return { 
        isValid: false, 
        error: 'Invalid image format. Supported: jpeg, jpg, png, gif, webp' 
      };
    }

    const mimeType = match[1];
    const base64Data = match[2];

    // Validate base64 data
    if (!base64Data || base64Data.length === 0) {
      return { isValid: false, error: 'Image data is empty' };
    }

    // Check image size
    const imageSizeInBytes = (base64Data.length * 3) / 4;
    const maxSizeInBytes = maxSizeMB * 1024 * 1024;
    
    if (imageSizeInBytes > maxSizeInBytes) {
      return { 
        isValid: false, 
        error: `Image size (${(imageSizeInBytes / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed size (${maxSizeMB}MB)` 
      };
    }

    return { 
      isValid: true, 
      mimeType: `image/${mimeType}`,
      sizeInBytes: imageSizeInBytes 
    };
  } catch (error) {
    return { isValid: false, error: 'Failed to validate image data' };
  }
};

/**
 * Extract MIME type from base64 image
 * @param {string} base64Image - Base64 encoded image
 * @returns {string|null} - MIME type or null if invalid
 */
const getMimeType = (base64Image) => {
  const match = base64Image.match(/^data:(image\/[a-zA-Z]*);base64,/);
  return match ? match[1] : null;
};

/**
 * Get image size in bytes from base64
 * @param {string} base64Image - Base64 encoded image
 * @returns {number} - Size in bytes
 */
const getImageSize = (base64Image) => {
  try {
    const base64Data = base64Image.split(',')[1];
    return (base64Data.length * 3) / 4;
  } catch (error) {
    return 0;
  }
};

/**
 * Convert base64 to buffer (if needed for processing)
 * @param {string} base64Image - Base64 encoded image
 * @returns {Buffer|null} - Buffer or null if invalid
 */
const base64ToBuffer = (base64Image) => {
  try {
    const base64Data = base64Image.split(',')[1];
    return Buffer.from(base64Data, 'base64');
  } catch (error) {
    return null;
  }
};

module.exports = {
  validateBase64Image,
  getMimeType,
  getImageSize,
  base64ToBuffer
};
