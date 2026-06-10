import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
});

// Upload a data-URI (base64) or existing URL to Cloudinary.
// Returns the Cloudinary secure URL. If Cloudinary is not configured,
// falls back to returning the original value so dev mode still works.
export async function uploadImage(dataUri) {
  if (!dataUri) return '';
  if (!process.env.CLOUDINARY_CLOUD_NAME) return dataUri;
  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: 'tower_tracker',
      resource_type: 'image',
    });
    return result.secure_url;
  } catch (err) {
    console.error('Cloudinary upload error:', err.message);
    return dataUri; // fall back to data URI so the record is never lost
  }
}
