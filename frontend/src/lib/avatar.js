import { supabase } from './supabase';

// Files live under a folder named for the user id; the storage policies
// require that first path segment to match auth.uid().
export async function uploadAvatar(file, userId) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${userId}/avatar.${ext}`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw error;
  return path;
}

// The bucket is private, so display needs a time-limited signed URL.
export async function avatarUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from('avatars')
    .createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}
