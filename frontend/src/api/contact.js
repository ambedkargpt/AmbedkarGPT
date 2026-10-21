import client from './client';

// POST /contact — landing-page contact form. Public: no account required.
// `website` is the honeypot and must stay empty for a real submission.
export async function sendContactMessage({ name, email, message, address, phone, website }) {
  const { data } = await client.post('/contact', {
    name,
    email,
    message,
    address: address || null,
    phone: phone || null,
    website: website || null,
  });
  return data;
}

/**
 * Offer a book or other material to the corpus.
 *
 * The file goes straight to S3 with a presigned POST (a book is usually larger
 * than the API gateway accepts in one request); the details are sent after it
 * has arrived. `onProgress` gets 0..1 while the file uploads.
 */
export async function contributeToCorpus({ file, onProgress, ...details }) {
  const { data: target } = await client.post('/contact/corpus/upload', {
    filename: file.name,
    content_type: file.type || 'application/octet-stream',
    size: file.size,
  });

  const form = new FormData();
  Object.entries(target.fields).forEach(([k, v]) => form.append(k, v));
  form.append('file', file);   // S3 requires the file to be the last field
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', target.url);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('upload failed'));
    xhr.send(form);
  });

  const { data } = await client.post('/contact/corpus', {
    ...details,
    file_key: target.key,
    file_name: file.name,
  });
  return data;
}
