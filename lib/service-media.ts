/**
 * Utilities for extracting and formatting service photos.
 * Supports both native image_url column and seamless [img:URL] tag encoded in description.
 */
export function extractServiceMedia(
  description: string | null,
  directImageUrl?: string | null,
): {
  description: string;
  imageUrl: string | null;
} {
  if (directImageUrl && directImageUrl.trim()) {
    return {
      description: description ? description.replace(/\[img:(.*?)\]/g, "").trim() : "",
      imageUrl: directImageUrl.trim(),
    };
  }

  if (!description) {
    return { description: "", imageUrl: null };
  }

  const match = description.match(/\[img:(.*?)\]/);
  if (match && match[1]) {
    return {
      description: description.replace(/\[img:(.*?)\]/g, "").trim(),
      imageUrl: match[1].trim(),
    };
  }

  return { description, imageUrl: null };
}

export function encodeServiceMedia(description: string, imageUrl?: string | null): string {
  const cleanDesc = description.replace(/\[img:(.*?)\]/g, "").trim();
  if (imageUrl && imageUrl.trim()) {
    return `${cleanDesc} [img:${imageUrl.trim()}]`.trim();
  }
  return cleanDesc;
}
